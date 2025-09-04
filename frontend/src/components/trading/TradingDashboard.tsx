import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ClockIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Tabs } from '@components/ui/Tabs';
import { Portfolio } from './Portfolio';
import { OrderBook } from './OrderBook';
import { TradeHistory } from './TradeHistory';
import { Watchlist } from './Watchlist';
import { MarketData } from './MarketData';
import { StockChart } from './StockChart';
import { OrderForm } from './OrderForm';
import { PositionManager } from './PositionManager';
import { RiskCalculator } from './RiskCalculator';
import { tradingService } from '@services/trading.service';
import { marketService } from '@services/market.service';
import { useWebSocket } from '@hooks/useWebSocket';
import { formatCurrency, formatPercentage } from '@utils/formatters';

export const TradingDashboard: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');
  const [activeTab, setActiveTab] = useState('portfolio');

  const { data: portfolioData } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => tradingService.getPortfolio(),
    refetchInterval: 5000,
  });

  const { data: marketOverview } = useQuery({
    queryKey: ['market-overview'],
    queryFn: () => marketService.getMarketOverview(),
    refetchInterval: 10000,
  });

  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: () => tradingService.getPositions(),
    refetchInterval: 5000,
  });

  // WebSocket connection for real-time data
  const { isConnected, data: realtimeData } = useWebSocket('/trading', {
    onMessage: (data) => {
      if (data.type === 'PRICE_UPDATE') {
        queryClient.setQueryData(['market-data', data.symbol], (oldData: any) => ({
          ...oldData,
          currentPrice: data.price,
          change: data.change,
          changePercent: data.changePercent,
        }));
      }
    },
  });

  const executeTrade = useMutation({
    mutationFn: tradingService.executeTrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['trade-history'] });
    },
  });

  const marketStats = [
    {
      title: 'NIFTY 50',
      value: marketOverview?.nifty50 || 0,
      change: marketOverview?.nifty50Change || 0,
      icon: ChartBarIcon,
    },
    {
      title: 'SENSEX',
      value: marketOverview?.sensex || 0,
      change: marketOverview?.sensexChange || 0,
      icon: TrendingUpIcon,
    },
    {
      title: 'BANK NIFTY',
      value: marketOverview?.bankNifty || 0,
      change: marketOverview?.bankNiftyChange || 0,
      icon: CurrencyDollarIcon,
    },
  ];

  const portfolioStats = [
    {
      title: t('trading.totalValue'),
      value: formatCurrency(portfolioData?.totalValue || 0),
      change: portfolioData?.dayChange || 0,
      changeType: (portfolioData?.dayChange || 0) >= 0 ? 'positive' : 'negative',
      icon: CurrencyDollarIcon,
    },
    {
      title: t('trading.dayPnL'),
      value: formatCurrency(portfolioData?.dayPnL || 0),
      change: portfolioData?.dayPnLPercent || 0,
      changeType: (portfolioData?.dayPnL || 0) >= 0 ? 'positive' : 'negative',
      icon: portfolioData?.dayPnL >= 0 ? TrendingUpIcon : TrendingDownIcon,
    },
    {
      title: t('trading.totalPnL'),
      value: formatCurrency(portfolioData?.totalPnL || 0),
      change: portfolioData?.totalReturn || 0,
      changeType: (portfolioData?.totalPnL || 0) >= 0 ? 'positive' : 'negative',
      icon: portfolioData?.totalPnL >= 0 ? TrendingUpIcon : TrendingDownIcon,
    },
    {
      title: t('trading.cashBalance'),
      value: formatCurrency(portfolioData?.cashBalance || 0),
      change: null,
      changeType: 'neutral',
      icon: CurrencyDollarIcon,
    },
  ];

  const tabs = [
    { id: 'portfolio', label: t('trading.portfolio'), icon: ChartBarIcon },
    { id: 'orders', label: t('trading.orders'), icon: ClockIcon },
    { id: 'history', label: t('trading.history'), icon: EyeIcon },
    { id: 'watchlist', label: t('trading.watchlist'), icon: EyeIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('trading.dashboard')}
        </h1>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? t('trading.connected') : t('trading.disconnected')}
          </span>
        </div>
      </div>

      {/* Market Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {marketStats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(stat.value)}
                  </p>
                  <p className={`text-sm ${
                    stat.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change >= 0 ? '+' : ''}{formatPercentage(stat.change)}
                  </p>
                </div>
                <div className="p-3 bg-primary-50 rounded-full">
                  <stat.icon className="h-6 w-6 text-primary-600" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {portfolioStats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </p>
                  <p className={`text-2xl font-semibold ${
                    stat.changeType === 'positive' 
                      ? 'text-green-600' 
                      : stat.changeType === 'negative'
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {stat.value}
                  </p>
                  {stat.change !== null && (
                    <p className={`text-sm ${
                      stat.changeType === 'positive' 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {stat.change >= 0 ? '+' : ''}{formatPercentage(stat.change)}
                    </p>
                  )}
                </div>
                <div className={`p-3 rounded-full ${
                  stat.changeType === 'positive' 
                    ? 'bg-green-50' 
                    : stat.changeType === 'negative'
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                }`}>
                  <stat.icon className={`h-6 w-6 ${
                    stat.changeType === 'positive' 
                      ? 'text-green-600' 
                      : stat.changeType === 'negative'
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`} />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Trading Interface */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Panel - Chart and Market Data */}
        <div className="xl:col-span-3 space-y-6">
          {/* Stock Chart */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedSymbol} - {t('trading.priceChart')}
              </h3>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">1D</Button>
                <Button variant="outline" size="sm">1W</Button>
                <Button variant="outline" size="sm">1M</Button>
                <Button variant="outline" size="sm">1Y</Button>
              </div>
            </div>
            <StockChart symbol={selectedSymbol} />
          </Card>

          {/* Market Data Table */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('trading.marketData')}
            </h3>
            <MarketData onSymbolSelect={setSelectedSymbol} />
          </Card>

          {/* Tabs for Portfolio, Orders, History */}
          <Card className="p-6">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
            <div className="mt-6">
              {activeTab === 'portfolio' && <Portfolio />}
              {activeTab === 'orders' && <OrderBook />}
              {activeTab === 'history' && <TradeHistory />}
              {activeTab === 'watchlist' && <Watchlist />}
            </div>
          </Card>
        </div>

        {/* Right Panel - Trading Tools */}
        <div className="space-y-6">
          {/* Order Form */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('trading.placeOrder')}
            </h3>
            <OrderForm
              symbol={selectedSymbol}
              onOrderSubmit={(order) => executeTrade.mutate(order)}
              isLoading={executeTrade.isPending}
            />
          </Card>

          {/* Position Manager */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('trading.positions')}
            </h3>
            <PositionManager positions={positions} />
          </Card>

          {/* Risk Calculator */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('trading.riskCalculator')}
            </h3>
            <RiskCalculator />
          </Card>
        </div>
      </div>
    </div>
  );
};
