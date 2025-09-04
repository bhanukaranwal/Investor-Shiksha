import { PrismaClient, UserRole, UserStatus, CourseLevel, CourseStatus, LanguageCode, RiskLevel, PortfolioType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // Hash password for demo users
  const hashedPassword = await bcrypt.hash('password123', 12);

  // Create Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@investorshiksha.com' },
    update: {},
    create: {
      email: 'admin@investorshiksha.com',
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      password: hashedPassword,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      riskProfile: RiskLevel.MODERATE,
      preferredLanguage: LanguageCode.EN,
    },
  });

  console.log('✓ Created admin user');

  // Create Demo Instructor
  const instructorUser = await prisma.user.upsert({
    where: { email: 'instructor@investorshiksha.com' },
    update: {},
    create: {
      email: 'instructor@investorshiksha.com',
      username: 'instructor',
      firstName: 'Demo',
      lastName: 'Instructor',
      password: hashedPassword,
      role: UserRole.INSTRUCTOR,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      riskProfile: RiskLevel.MODERATE,
      preferredLanguage: LanguageCode.EN,
    },
  });

  console.log('✓ Created instructor user');

  // Create Demo Student Users
  const demoUsers = [
    {
      email: 'student1@investorshiksha.com',
      username: 'student1',
      firstName: 'Rahul',
      lastName: 'Sharma',
      preferredLanguage: LanguageCode.HI,
    },
    {
      email: 'student2@investorshiksha.com', 
      username: 'student2',
      firstName: 'Priya',
      lastName: 'Patel',
      preferredLanguage: LanguageCode.GU,
    },
    {
      email: 'student3@investorshiksha.com',
      username: 'student3', 
      firstName: 'Arjun',
      lastName: 'Kumar',
      preferredLanguage: LanguageCode.TA,
    },
  ];

  for (const userData of demoUsers) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        ...userData,
        password: hashedPassword,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
        riskProfile: RiskLevel.MODERATE,
      },
    });
  }

  console.log('✓ Created demo student users');

  // Create Sample Courses
  const courses = [
    {
      title: 'Introduction to Stock Market',
      slug: 'intro-to-stock-market',
      description: 'Learn the basics of stock market investing and trading fundamentals.',
      shortDescription: 'Master stock market basics',
      level: CourseLevel.BEGINNER,
      status: CourseStatus.PUBLISHED,
      price: 0,
      duration: 300, // 5 hours in minutes
      category: 'Fundamentals',
      instructorId: instructorUser.id,
      isPublished: true,
      isFeatured: true,
      tags: ['stocks', 'basics', 'investing', 'fundamentals'],
      prerequisites: [],
      learningOutcomes: [
        'Understand stock market terminology',
        'Learn how to read stock charts',
        'Identify different types of orders',
        'Analyze company fundamentals',
      ],
    },
    {
      title: 'Technical Analysis Masterclass',
      slug: 'technical-analysis-masterclass',
      description: 'Advanced technical analysis techniques for profitable trading.',
      shortDescription: 'Master technical analysis',
      level: CourseLevel.INTERMEDIATE,
      status: CourseStatus.PUBLISHED,
      price: 2999,
      originalPrice: 4999,
      duration: 480, // 8 hours
      category: 'Technical Analysis',
      instructorId: instructorUser.id,
      isPublished: true,
      isFeatured: true,
      tags: ['technical-analysis', 'charts', 'indicators', 'patterns'],
      prerequisites: ['Basic understanding of stock market'],
      learningOutcomes: [
        'Master candlestick patterns',
        'Use technical indicators effectively',
        'Identify support and resistance levels',
        'Develop trading strategies',
      ],
    },
    {
      title: 'Portfolio Management & Risk Assessment',
      slug: 'portfolio-management-risk',
      description: 'Learn to build and manage diversified investment portfolios.',
      shortDescription: 'Professional portfolio management',
      level: CourseLevel.ADVANCED,
      status: CourseStatus.PUBLISHED,
      price: 4999,
      originalPrice: 7999,
      duration: 600, // 10 hours
      category: 'Portfolio Management',
      instructorId: instructorUser.id,
      isPublished: true,
      tags: ['portfolio', 'risk-management', 'diversification', 'asset-allocation'],
      prerequisites: ['Stock market basics', 'Understanding of financial statements'],
      learningOutcomes: [
        'Build diversified portfolios',
        'Assess and manage investment risk',
        'Optimize asset allocation',
        'Implement rebalancing strategies',
      ],
    },
  ];

  for (const courseData of courses) {
    const course = await prisma.course.upsert({
      where: { slug: courseData.slug },
      update: {},
      create: courseData,
    });

    // Create sample lessons for each course
    const lessons = [
      {
        title: 'Course Introduction',
        slug: 'introduction',
        description: 'Welcome to the course and overview of what you will learn',
        duration: 600, // 10 minutes in seconds
        order: 1,
        isPreview: true,
        isPublished: true,
      },
      {
        title: 'Key Concepts',
        slug: 'key-concepts',
        description: 'Understanding the fundamental concepts and terminology',
        duration: 1800, // 30 minutes
        order: 2,
        isPublished: true,
      },
      {
        title: 'Practical Application',
        slug: 'practical-application',
        description: 'Hands-on examples and real-world applications',
        duration: 2400, // 40 minutes
        order: 3,
        isPublished: true,
      },
      {
        title: 'Assessment and Next Steps',
        slug: 'assessment',
        description: 'Test your knowledge and plan your learning journey',
        duration: 1200, // 20 minutes
        order: 4,
        isPublished: true,
      },
    ];

    for (const lessonData of lessons) {
      await prisma.lesson.upsert({
        where: { 
          courseId_slug: {
            courseId: course.id,
            slug: lessonData.slug,
          }
        },
        update: {},
        create: {
          ...lessonData,
          courseId: course.id,
        },
      });
    }

    console.log(`✓ Created course: ${course.title} with lessons`);
  }

  // Create Sample Market Data
  const marketData = [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      sector: 'Energy',
      industry: 'Oil & Gas Refining',
      currentPrice: 2450.75,
      previousClose: 2435.20,
      change: 15.55,
      changePercent: 0.64,
      volume: BigInt(1250000),
      avgVolume: BigInt(1100000),
      high52Week: 2856.15,
      low52Week: 2220.30,
      pe: 28.45,
      eps: 86.12,
    },
    {
      symbol: 'TCS',
      name: 'Tata Consultancy Services',
      sector: 'Technology',
      industry: 'IT Services',
      currentPrice: 3680.45,
      previousClose: 3695.80,
      change: -15.35,
      changePercent: -0.42,
      volume: BigInt(890000),
      avgVolume: BigInt(950000),
      high52Week: 4043.75,
      low52Week: 3100.25,
      pe: 32.15,
      eps: 114.52,
    },
    {
      symbol: 'INFY',
      name: 'Infosys Limited',
      sector: 'Technology',
      industry: 'IT Services',
      currentPrice: 1789.30,
      previousClose: 1775.65,
      change: 13.65,
      changePercent: 0.77,
      volume: BigInt(1150000),
      avgVolume: BigInt(1050000),
      high52Week: 1953.90,
      low52Week: 1311.20,
      pe: 29.85,
      eps: 59.96,
    },
  ];

  for (const stockData of marketData) {
    await prisma.marketData.upsert({
      where: { symbol: stockData.symbol },
      update: {
        ...stockData,
        lastUpdated: new Date(),
      },
      create: {
        ...stockData,
        lastUpdated: new Date(),
      },
    });
  }

  console.log('✓ Created sample market data');

  // Create Sample Portfolio for Demo User
  const demoStudent = await prisma.user.findUnique({
    where: { email: 'student1@investorshiksha.com' }
  });

  if (demoStudent) {
    const portfolio = await prisma.portfolio.upsert({
      where: { 
        userId_name: {
          userId: demoStudent.id,
          name: 'My Portfolio'
        }
      },
      update: {},
      create: {
        userId: demoStudent.id,
        name: 'My Portfolio',
        type: PortfolioType.SIMULATION,
        totalValue: 125000,
        cashBalance: 100000,
        totalPnL: 2500,
        dayPnL: 150,
        totalReturn: 2.0,
        isActive: true,
      },
    });

    // Create sample holdings
    const holdings = [
      {
        symbol: 'RELIANCE',
        quantity: 5,
        averagePrice: 2400.00,
        currentPrice: 2450.75,
      },
      {
        symbol: 'TCS',
        quantity: 3,
        averagePrice: 3650.00,
        currentPrice: 3680.45,
      },
    ];

    for (const holding of holdings) {
      const totalValue = holding.quantity * holding.currentPrice;
      const unrealizedPnL = holding.quantity * (holding.currentPrice - holding.averagePrice);

      await prisma.holding.upsert({
        where: {
          portfolioId_symbol: {
            portfolioId: portfolio.id,
            symbol: holding.symbol,
          }
        },
        update: {},
        create: {
          portfolioId: portfolio.id,
          symbol: holding.symbol,
          quantity: holding.quantity,
          averagePrice: holding.averagePrice,
          currentPrice: holding.currentPrice,
          totalValue,
          unrealizedPnL,
        },
      });
    }

    console.log('✓ Created sample portfolio and holdings');
  }

  // Create Sample News Articles
  const newsArticles = [
    {
      title: 'Indian Stock Market Hits Record High Amid Strong Economic Data',
      summary: 'Markets surge as GDP growth exceeds expectations and inflation remains under control.',
      content: 'The Indian stock market reached new record highs today...',
      source: 'Economic Times',
      sourceUrl: 'https://economictimes.com/sample-article',
      category: 'Market',
      tags: ['stock-market', 'economy', 'growth'],
      sentiment: 'positive',
      language: LanguageCode.EN,
      publishedAt: new Date(),
    },
    {
      title: 'नई निवेश नीति से बढ़ेगा विदेशी निवेश',
      summary: 'सरकार की नई नीति से विदेशी निवेशकों का भारत में रुझान बढ़ने की उम्मीद।',
      content: 'भारत सरकार ने आज एक नई निवेश नीति का ऐलान किया...',
      source: 'आर्थिक समय',
      sourceUrl: 'https://economictimes.com/hindi/sample',
      category: 'Policy',
      tags: ['investment', 'policy', 'fdi'],
      sentiment: 'positive',
      language: LanguageCode.HI,
      publishedAt: new Date(),
    },
  ];

  for (const article of newsArticles) {
    await prisma.news.create({
      data: article,
    });
  }

  console.log('✓ Created sample news articles');

  // Create Sample Achievements
  const achievements = [
    {
      name: 'First Course Completed',
      description: 'Complete your first course successfully',
      icon: 'trophy',
      category: 'Learning',
      points: 100,
      condition: { type: 'course_completion', count: 1 },
      isActive: true,
    },
    {
      name: 'Trading Rookie',
      description: 'Execute your first trade in simulation',
      icon: 'chart',
      category: 'Trading',
      points: 50,
      condition: { type: 'trade_execution', count: 1 },
      isActive: true,
    },
    {
      name: 'Portfolio Builder',
      description: 'Build a portfolio with at least 5 different stocks',
      icon: 'briefcase',
      category: 'Portfolio',
      points: 200,
      condition: { type: 'portfolio_diversity', count: 5 },
      isActive: true,
    },
  ];

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { name: achievement.name },
      update: {},
      create: achievement,
    });
  }

  console.log('✓ Created sample achievements');

  // Create System Configuration
  const systemConfigs = [
    {
      key: 'platform_settings',
      value: {
        maintenance_mode: false,
        registration_enabled: true,
        email_verification_required: true,
        default_language: 'en',
        supported_languages: ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml'],
      },
      description: 'General platform settings',
    },
    {
      key: 'trading_settings',
      value: {
        simulation_mode_default: true,
        max_portfolio_value: 10000000,
        default_cash_balance: 100000,
        trading_hours: {
          start: '09:15',
          end: '15:30',
          timezone: 'Asia/Kolkata'
        },
      },
      description: 'Trading simulation settings',
    },
    {
      key: 'notification_settings',
      value: {
        email_enabled: true,
        sms_enabled: false,
        push_enabled: true,
        batch_notifications: true,
        rate_limits: {
          email_per_hour: 50,
          sms_per_hour: 10,
          push_per_hour: 100
        },
      },
      description: 'Notification system settings',
    },
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }

  console.log('✓ Created system configuration');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\nDemo Credentials:');
  console.log('Admin: admin@investorshiksha.com / password123');
  console.log('Instructor: instructor@investorshiksha.com / password123');
  console.log('Student: student1@investorshiksha.com / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
