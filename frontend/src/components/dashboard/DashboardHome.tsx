import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ChartBarIcon,
  BookOpenIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  BellIcon,
  TrendingUpIcon,
} from '@heroicons/react/24/outline';

import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Progress } from '@components/ui/Progress';
import { Chart } from '@components/ui/Chart';
import { LearningProgress } from './LearningProgress';
import { RecentActivity } from './RecentActivity';
import { Notifications } from './Notifications';
import { PerformanceMetrics } from './PerformanceMetrics';
import { QuickActions } from './QuickActions';
import { RecommendedCourses } from './RecommendedCourses';
import { Achievements } from './Achievements';
import { useAuth } from '@hooks/useAuth';
import { dashboardService } from '@services/dashboard.service';

export const DashboardHome: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', user?.id],
    queryFn: () => dashboardService.getDashboardData(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: portfolioSummary } = useQuery({
    queryKey: ['portfolio-summary', user?.id],
    queryFn: () => dashboardService.getPortfolioSummary(),
  });

  const stats = [
    {
      title: t('dashboard.totalValue'),
      value: portfolioSummary?.totalValue || '₹0',
      change: portfolioSummary?.dayChange || '0%',
      changeType: portfolioSummary?.dayChange?.startsWith('-') ? 'negative' : 'positive',
      icon: CurrencyDollarIcon,
    },
    {
      title: t('dashboard.coursesCompleted'),
      value: dashboardData?.coursesCompleted || 0,
      change: `+${dashboardData?.newCoursesThisMonth || 0} ${t('dashboard.thisMonth')}`,
      changeType: 'positive',
      icon: BookOpenIcon,
    },
    {
      title: t('dashboard.totalTrades'),
      value: dashboardData?.totalTrades || 0,
      change: `+${dashboardData?.tradesThisWeek || 0} ${t('dashboard.thisWeek')}`,
      changeType: 'positive',
      icon: TrendingUpIcon,
    },
    {
      title: t('dashboard.achievements'),
      value: dashboardData?.achievements || 0,
      change: `+${dashboardData?.newAchievements || 0} ${t('dashboard.new')}`,
      changeType: 'positive',
      icon: TrophyIcon,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {t('dashboard.welcome', { name: user?.firstName })}
            </h1>
            <p className="text-primary-100 mt-1">
              {t('dashboard.welcomeMessage')}
            </p>
          </div>
          <div className="hidden md:block">
            <img
              src="/images/dashboard-hero.svg"
              alt="Dashboard"
              className="h-20 w-20"
            />
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
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
                    {stat.value}
                  </p>
                  <p className={`text-sm ${
                    stat.changeType === 'positive' 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {stat.change}
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance Chart */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('dashboard.portfolioPerformance')}
              </h3>
              <Button variant="outline" size="sm">
                {t('dashboard.viewDetails')}
              </Button>
            </div>
            <PerformanceMetrics />
          </Card>

          {/* Learning Progress */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dashboard.learningProgress')}
            </h3>
            <LearningProgress />
          </Card>

          {/* Recent Activity */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dashboard.recentActivity')}
            </h3>
            <RecentActivity />
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dashboard.quickActions')}
            </h3>
            <QuickActions />
          </Card>

          {/* Notifications */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('dashboard.notifications')}
              </h3>
              <BellIcon className="h-5 w-5 text-gray-500" />
            </div>
            <Notifications />
          </Card>

          {/* Recommended Courses */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dashboard.recommendedCourses')}
            </h3>
            <RecommendedCourses />
          </Card>

          {/* Achievements */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t('dashboard.recentAchievements')}
            </h3>
            <Achievements />
          </Card>
        </div>
      </div>
    </div>
  );
};
