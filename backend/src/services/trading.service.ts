import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/error';
import { calculatePortfolioMetrics, calculateRisk } from '../utils/calculations';
import { validateTrade } from '../utils/validation';
import { marketService } from './market.service';
import { notificationService } from './notification.service';

const prisma = new PrismaClient();

const tradeSchema = z.object({
  symbol: z.string().min(1).max(20),
  type: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LIMIT']),
  quantity: z.number().int().positive(),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  portfolioId: z.string().uuid(),
});

export class TradingService {
  async getPortfolio(userId: string) {
    try {
      const portfolio = await prisma.portfolio.findFirst({
        where: { userId, isActive: true },
        include: {
          holdings: true,
          trades: {
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!portfolio) {
        throw new ApiError(404, 'Portfolio not found');
      }

      // Calculate real-time portfolio metrics
      const metrics = await this.calculatePortfolioMetrics(portfolio);

      return {
        ...portfolio,
        ...metrics,
      };
    } catch (error) {
      logger.error('Error fetching portfolio:', error);
      throw error;
    }
  }

  async executeTrade(userId: string, tradeData: z.infer<typeof tradeSchema>) {
    const validatedData = tradeSchema.parse(tradeData);

    try {
      // Start transaction
      return await prisma.$transaction(async (tx) => {
        // Validate portfolio ownership
        const portfolio = await tx.portfolio.findFirst({
          where: {
            id: validatedData.portfolioId,
            userId,
            isActive: true,
          },
        });

        if (!portfolio) {
          throw new ApiError(404, 'Portfolio not found');
        }

        // Get current market price
        const marketData = await marketService.getStockPrice(validatedData.symbol);
        const currentPrice = marketData.currentPrice;

        // Validate trade
        const validation = await validateTrade({
          ...validatedData,
          currentPrice,
          portfolio,
        });

        if (!validation.isValid) {
          throw new ApiError(400, validation.error);
        }

        // Calculate execution price
        let executionPrice = currentPrice;
        if (validatedData.orderType === 'LIMIT' && validatedData.price) {
          executionPrice = validatedData.price;
        }

        // Calculate fees
        const fees = this.calculateTradingFees(
          validatedData.quantity * executionPrice
        );

        // Create trade record
        const trade = await tx.trade.create({
          data: {
            userId,
            portfolioId: validatedData.portfolioId,
            symbol: validatedData.symbol,
            type: validatedData.type,
            orderType: validatedData.orderType,
            quantity: validatedData.quantity,
            price: validatedData.price || currentPrice,
            executedPrice: executionPrice,
            status: validatedData.orderType === 'MARKET' ? 'EXECUTED' : 'PENDING',
            fees,
            executedAt: validatedData.orderType === 'MARKET' ? new Date() : null,
          },
        });

        // If market order, execute immediately
        if (validatedData.orderType === 'MARKET') {
          await this.processTradeExecution(tx, trade, portfolio);
        }

        // Send notification
        await notificationService.sendTradeNotification(userId, trade);

        return trade;
      });
    } catch (error) {
      logger.error('Error executing trade:', error);
      throw error;
    }
  }

  async getPositions(userId: string) {
    try {
      const portfolio = await prisma.portfolio.findFirst({
        where: { userId, isActive: true },
        include: {
          holdings: {
            where: { quantity: { gt: 0 } },
          },
        },
      });

      if (!portfolio) {
        return [];
      }

      // Enrich holdings with current market data
      const positions = await Promise.all(
        portfolio.holdings.map(async (holding) => {
          const marketData = await marketService.getStockPrice(holding.symbol);
          const currentValue = holding.quantity * marketData.currentPrice;
          const unrealizedPnL = currentValue - (holding.quantity * holding.averagePrice);
          const unrealizedPnLPercent = (unrealizedPnL / (holding.quantity * holding.averagePrice)) * 100;

          return {
            ...holding,
            currentPrice: marketData.currentPrice,
            currentValue,
            unrealizedPnL,
            unrealizedPnLPercent,
            dayChange: marketData.change,
            dayChangePercent: marketData.changePercent,
          };
        })
      );

      return positions;
    } catch (error) {
      logger.error('Error fetching positions:', error);
      throw error;
    }
  }

  async getTradeHistory(userId: string, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;

      const [trades, total] = await Promise.all([
        prisma.trade.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.trade.count({
          where: { userId },
        }),
      ]);

      return {
        trades,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error fetching trade history:', error);
      throw error;
    }
  }

  async getWatchlist(userId: string) {
    try {
      const watchlists = await prisma.watchlist.findMany({
        where: { userId },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'asc' },
        ],
      });

      // Enrich with market data
      const enrichedWatchlists = await Promise.all(
        watchlists.map(async (watchlist) => {
          const symbolsData = await Promise.all(
            watchlist.symbols.map(async (symbol) => {
              const marketData = await marketService.getStockPrice(symbol);
              return {
                symbol,
                ...marketData,
              };
            })
          );

          return {
            ...watchlist,
            symbolsData,
          };
        })
      );

      return enrichedWatchlists;
    } catch (error) {
      logger.error('Error fetching watchlist:', error);
      throw error;
    }
  }

  async addToWatchlist(userId: string, watchlistId: string, symbol: string) {
    try {
      const watchlist = await prisma.watchlist.findFirst({
        where: { id: watchlistId, userId },
      });

      if (!watchlist) {
        throw new ApiError(404, 'Watchlist not found');
      }

      if (watchlist.symbols.includes(symbol)) {
        throw new ApiError(400, 'Symbol already in watchlist');
      }

      const updatedWatchlist = await prisma.watchlist.update({
        where: { id: watchlistId },
        data: {
          symbols: [...watchlist.symbols, symbol],
        },
      });

      return updatedWatchlist;
    } catch (error) {
      logger.error('Error adding to watchlist:', error);
      throw error;
    }
  }

  async removeFromWatchlist(userId: string, watchlistId: string, symbol: string) {
    try {
      const watchlist = await prisma.watchlist.findFirst({
        where: { id: watchlistId, userId },
      });

      if (!watchlist) {
        throw new ApiError(404, 'Watchlist not found');
      }

      const updatedWatchlist = await prisma.watchlist.update({
        where: { id: watchlistId },
        data: {
          symbols: watchlist.symbols.filter(s => s !== symbol),
        },
      });

      return updatedWatchlist;
    } catch (error) {
      logger.error('Error removing from watchlist:', error);
      throw error;
    }
  }

  async calculateRiskMetrics(userId: string, portfolioId: string) {
    try {
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: portfolioId, userId },
        include: { holdings: true },
      });

      if (!portfolio) {
        throw new ApiError(404, 'Portfolio not found');
      }

      const riskMetrics = await calculateRisk(portfolio);

      return riskMetrics;
    } catch (error) {
      logger.error('Error calculating risk metrics:', error);
      throw error;
    }
  }

  private async calculatePortfolioMetrics(portfolio: any) {
    try {
      let totalValue = portfolio.cashBalance;
      let dayPnL = 0;
      let totalPnL = 0;

      // Calculate holdings value
      for (const holding of portfolio.holdings) {
        const marketData = await marketService.getStockPrice(holding.symbol);
        const currentValue = holding.quantity * marketData.currentPrice;
        const holdingPnL = currentValue - (holding.quantity * holding.averagePrice);
        const dayChange = holding.quantity * marketData.change;

        totalValue += currentValue;
        totalPnL += holdingPnL;
        dayPnL += dayChange;
      }

      const totalReturn = totalPnL / (totalValue - totalPnL) * 100;
      const dayReturn = dayPnL / totalValue * 100;

      return {
        totalValue,
        dayPnL,
        totalPnL,
        totalReturn,
        dayReturn,
        dayPnLPercent: dayReturn,
      };
    } catch (error) {
      logger.error('Error calculating portfolio metrics:', error);
      throw error;
    }
  }

  private calculateTradingFees(tradeValue: number): number {
    const brokerage = Math.min(tradeValue * 0.0003, 20); // 0.03% or ₹20, whichever is lower
    const stt = tradeValue * 0.001; // 0.1%
    const exchangeCharges = tradeValue * 0.0000345; // 0.00345%
    const gst = (brokerage + exchangeCharges) * 0.18; // 18% GST
    const sebiCharges = tradeValue * 0.00001; // 0.001%
    const stampDuty = tradeValue * 0.00015; // 0.015%

    return brokerage + stt + exchangeCharges + gst + sebiCharges + stampDuty;
  }

  private async processTradeExecution(tx: any, trade: any, portfolio: any) {
    try {
      if (trade.type === 'BUY') {
        // Deduct cash
        const totalCost = trade.quantity * trade.executedPrice + trade.fees;
        await tx.portfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: { decrement: totalCost },
          },
        });

        // Update or create holding
        const existingHolding = await tx.holding.findFirst({
          where: {
            portfolioId: portfolio.id,
            symbol: trade.symbol,
          },
        });

        if (existingHolding) {
          const newQuantity = existingHolding.quantity + trade.quantity;
          const newAveragePrice = (
            (existingHolding.quantity * existingHolding.averagePrice) +
            (trade.quantity * trade.executedPrice)
          ) / newQuantity;

          await tx.holding.update({
            where: { id: existingHolding.id },
            data: {
              quantity: newQuantity,
              averagePrice: newAveragePrice,
            },
          });
        } else {
          await tx.holding.create({
            data: {
              portfolioId: portfolio.id,
              symbol: trade.symbol,
              quantity: trade.quantity,
              averagePrice: trade.executedPrice,
            },
          });
        }
      } else {
        // SELL
        const holding = await tx.holding.findFirst({
          where: {
            portfolioId: portfolio.id,
            symbol: trade.symbol,
          },
        });

        if (!holding || holding.quantity < trade.quantity) {
          throw new ApiError(400, 'Insufficient holdings');
        }

        // Add cash
        const totalReceived = trade.quantity * trade.executedPrice - trade.fees;
        await tx.portfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: { increment: totalReceived },
          },
        });

        // Update holding
        const newQuantity = holding.quantity - trade.quantity;
        if (newQuantity === 0) {
          await tx.holding.delete({
            where: { id: holding.id },
          });
        } else {
          await tx.holding.update({
            where: { id: holding.id },
            data: { quantity: newQuantity },
          });
        }
      }

      // Record transaction
      await tx.transaction.create({
        data: {
          userId: trade.userId,
          portfolioId: portfolio.id,
          type: 'TRADE',
          amount: trade.type === 'BUY' 
            ? -(trade.quantity * trade.executedPrice + trade.fees)
            : (trade.quantity * trade.executedPrice - trade.fees),
          description: `${trade.type} ${trade.quantity} ${trade.symbol} @ ₹${trade.executedPrice}`,
          reference: trade.id,
        },
      });
    } catch (error) {
      logger.error('Error processing trade execution:', error);
      throw error;
    }
  }
}

export const tradingService = new TradingService();
