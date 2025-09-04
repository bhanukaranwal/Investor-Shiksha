-- database/migrations/006_add_advanced_features.sql
-- Advanced features and optimizations

-- Add full-text search indexes
CREATE INDEX CONCURRENTLY idx_courses_search 
ON courses USING gin(to_tsvector('english', title || ' ' || description));

CREATE INDEX CONCURRENTLY idx_news_search 
ON news USING gin(to_tsvector('english', title || ' ' || summary));

-- Add performance indexes
CREATE INDEX CONCURRENTLY idx_trades_user_date ON trades(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_portfolio_user_active ON portfolios(user_id, is_active);
CREATE INDEX CONCURRENTLY idx_holdings_portfolio_symbol ON holdings(portfolio_id, symbol);
CREATE INDEX CONCURRENTLY idx_market_data_symbol_updated ON market_data(symbol, last_updated DESC);

-- Add notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT true,
    sms_enabled BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT true,
    trading_alerts BOOLEAN DEFAULT true,
    course_updates BOOLEAN DEFAULT true,
    market_news BOOLEAN DEFAULT true,
    achievement_alerts BOOLEAN DEFAULT true,
    community_updates BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add user activity tracking
CREATE TABLE user_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add course completion certificates
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    certificate_url VARCHAR(500),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    verification_code VARCHAR(100) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add trading strategies table
CREATE TABLE trading_strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    strategy_type VARCHAR(50),
    parameters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add market alerts
CREATE TABLE market_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'price_above', 'price_below', 'volume_spike', etc.
    trigger_value DECIMAL(15,4),
    current_value DECIMAL(15,4),
    is_triggered BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add content ratings and reviews
CREATE TABLE content_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL, -- 'course', 'lesson', 'news'
    content_id UUID NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, content_type, content_id)
);

-- Add user learning paths
CREATE TABLE learning_paths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    course_sequence JSONB NOT NULL, -- Array of course IDs in order
    progress INTEGER DEFAULT 0,
    estimated_duration INTEGER, -- in hours
    difficulty_level VARCHAR(20),
    is_custom BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add system announcements
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    announcement_type VARCHAR(50) DEFAULT 'general',
    priority INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    target_audience JSONB DEFAULT '{}', -- Filter criteria
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add user referrals
CREATE TABLE user_referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_code VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'expired'
    reward_earned DECIMAL(10,2) DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(referrer_id, referee_id)
);

-- Add triggers for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trading_strategies_updated_at
    BEFORE UPDATE ON trading_strategies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_alerts_updated_at
    BEFORE UPDATE ON market_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_ratings_updated_at
    BEFORE UPDATE ON content_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learning_paths_updated_at
    BEFORE UPDATE ON learning_paths
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add notification triggers
CREATE OR REPLACE FUNCTION notify_user_activity()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_activities (
        user_id, 
        activity_type, 
        resource_type, 
        resource_id,
        metadata
    ) VALUES (
        NEW.user_id,
        TG_OP || '_' || TG_TABLE_NAME,
        TG_TABLE_NAME,
        NEW.id,
        jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP)
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply activity tracking to key tables
CREATE TRIGGER track_trade_activity
    AFTER INSERT ON trades
    FOR EACH ROW
    EXECUTE FUNCTION notify_user_activity();

CREATE TRIGGER track_enrollment_activity
    AFTER INSERT ON enrollments
    FOR EACH ROW
    EXECUTE FUNCTION notify_user_activity();

CREATE TRIGGER track_achievement_activity
    AFTER INSERT ON user_achievements
    FOR EACH ROW
    EXECUTE FUNCTION notify_user_activity();
