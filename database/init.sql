-- Create database if not exists
CREATE DATABASE IF NOT EXISTS investor_shiksha;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Set timezone
SET timezone = 'UTC';

-- Create custom types
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator', 'instructor');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
CREATE TYPE course_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE assessment_type AS ENUM ('quiz', 'assignment', 'exam', 'practical');
CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'fill_blank', 'matching', 'essay');
CREATE TYPE trade_type AS ENUM ('buy', 'sell');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop_loss', 'stop_limit');
CREATE TYPE order_status AS ENUM ('pending', 'executed', 'cancelled', 'expired');
CREATE TYPE notification_type AS ENUM ('system', 'course', 'trading', 'community', 'achievement');
CREATE TYPE notification_status AS ENUM ('unread', 'read', 'archived');
CREATE TYPE risk_level AS ENUM ('conservative', 'moderate', 'aggressive');
CREATE TYPE portfolio_type AS ENUM ('real', 'simulation');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'trade', 'dividend', 'fee');
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived', 'flagged');
CREATE TYPE language_code AS ENUM ('en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml');

-- Create audit function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create notification trigger function
CREATE OR REPLACE FUNCTION notify_table_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'table_change',
        json_build_object(
            'table', TG_TABLE_NAME,
            'action', TG_OP,
            'id', COALESCE(NEW.id, OLD.id)
        )::text
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
