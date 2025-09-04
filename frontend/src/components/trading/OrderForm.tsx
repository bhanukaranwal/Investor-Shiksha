// frontend/src/components/trading/OrderForm.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Card } from '@components/ui/Card';

const orderSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  type: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS']),
  quantity: z.number().int().positive('Quantity must be positive'),
  price: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface OrderFormProps {
  symbol: string;
  onOrderSubmit: (order: OrderFormData) => void;
  isLoading?: boolean;
}

export const OrderForm: React.FC<OrderFormProps> = ({
  symbol,
  onOrderSubmit,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      symbol,
      type: 'BUY',
      orderType: 'MARKET',
    },
  });

  const watchOrderType = watch('orderType');
  const watchQuantity = watch('quantity');
  const watchPrice = watch('price');

  const estimatedValue = watchQuantity && watchPrice 
    ? watchQuantity * watchPrice 
    : 0;

  const onSubmit = (data: OrderFormData) => {
    onOrderSubmit(data);
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Order Type Toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setOrderType('BUY')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              orderType === 'BUY'
                ? 'bg-green-600 text-white'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            {t('trading.buy')}
          </button>
          <button
            type="button"
            onClick={() => setOrderType('SELL')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              orderType === 'SELL'
                ? 'bg-red-600 text-white'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            {t('trading.sell')}
          </button>
        </div>

        <Input
          label={t('trading.symbol')}
          {...register('symbol')}
          error={errors.symbol?.message}
          disabled
        />

        <Select
          label={t('trading.orderType')}
          {...register('orderType')}
          options={[
            { value: 'MARKET', label: t('trading.market') },
            { value: 'LIMIT', label: t('trading.limit') },
            { value: 'STOP_LOSS', label: t('trading.stopLoss') },
          ]}
          error={errors.orderType?.message}
        />

        <Input
          type="number"
          label={t('trading.quantity')}
          {...register('quantity', { valueAsNumber: true })}
          error={errors.quantity?.message}
          min="1"
        />

        {watchOrderType !== 'MARKET' && (
          <Input
            type="number"
            step="0.01"
            label={t('trading.price')}
            {...register('price', { valueAsNumber: true })}
            error={errors.price?.message}
            min="0.01"
          />
        )}

        {watchOrderType === 'STOP_LOSS' && (
          <Input
            type="number"
            step="0.01"
            label={t('trading.stopPrice')}
            {...register('stopPrice', { valueAsNumber: true })}
            error={errors.stopPrice?.message}
            min="0.01"
          />
        )}

        {/* Order Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            {t('trading.orderSummary')}
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('trading.estimatedValue')}:</span>
              <span className="font-medium">₹{estimatedValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('trading.brokerage')}:</span>
              <span className="font-medium">₹{(estimatedValue * 0.0003).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="text-gray-900 font-medium">{t('trading.total')}:</span>
              <span className="font-semibold">₹{(estimatedValue + estimatedValue * 0.0003).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          variant={orderType === 'BUY' ? 'primary' : 'danger'}
          fullWidth
          loading={isLoading}
        >
          {orderType === 'BUY' ? t('trading.placeBuyOrder') : t('trading.placeSellOrder')}
        </Button>
      </form>
    </Card>
  );
};
