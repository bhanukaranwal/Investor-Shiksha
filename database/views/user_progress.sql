-- View for comprehensive user learning progress
CREATE OR REPLACE VIEW user_progress_view AS
SELECT 
    u.id as user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.preferred_language,
    u.created_at as user_joined,
    
    -- Course Statistics
    COUNT(DISTINCT e.id) as total_enrollments,
    COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.id END) as completed_courses,
    ROUND(
        CASE WHEN COUNT(DISTINCT e.id) > 0 
        THEN (COUNT(DISTINCT CASE WHEN e.completed_at IS NOT NULL THEN e.id END)::decimal / COUNT(DISTINCT e.id)) * 100 
        ELSE 0 END, 2
    ) as course_completion_rate,
    
    -- Learning Progress
    COALESCE(AVG(e.progress), 0) as avg_course_progress,
    SUM(COALESCE(lp.time_spent, 0)) as total_learning_time_minutes,
    
    -- Assessment Statistics  
    COUNT(DISTINCT ar.id) as total_assessments_taken,
    COUNT(DISTINCT CASE WHEN ar.is_passed = true THEN ar.id END) as passed_assessments,
    COALESCE(AVG(ar.percentage), 0) as avg_assessment_score,
    
    -- Achievement Statistics
    COUNT(DISTINCT ua.id) as total_achievements,
    COALESCE(SUM(a.points), 0) as total_points,
    
    -- Trading Statistics
    COUNT(DISTINCT t.id) as total_trades,
    COUNT(DISTINCT p.id) as active_portfolios,
    COALESCE(SUM(p.total_pnl), 0) as total_trading_pnl,
    
    -- Activity Statistics
    MAX(e.last_accessed_at) as last_learning_activity,
    MAX(t.created_at) as last_trading_activity,
    
    -- Engagement Level
    CASE 
        WHEN MAX(GREATEST(e.last_accessed_at, t.created_at)) >= CURRENT_DATE - INTERVAL '7 days' THEN 'High'
        WHEN MAX(GREATEST(e.last_accessed_at, t.created_at)) >= CURRENT_DATE - INTERVAL '30 days' THEN 'Medium'
        WHEN MAX(GREATEST(e.last_accessed_at, t.created_at)) >= CURRENT_DATE - INTERVAL '90 days' THEN 'Low'
        ELSE 'Inactive'
    END as engagement_level

FROM users u
LEFT JOIN enrollments e ON u.id = e.user_id
LEFT JOIN learning_progress lp ON u.id = lp.user_id
LEFT JOIN assessment_results ar ON u.id = ar.user_id
LEFT JOIN user_achievements ua ON u.id = ua.user_id
LEFT JOIN achievements a ON ua.achievement_id = a.id
LEFT JOIN trades t ON u.id = t.user_id
LEFT JOIN portfolios p ON u.id = p.user_id AND p.is_active = true
WHERE u.status = 'ACTIVE'
GROUP BY u.id, u.first_name, u.last_name, u.email, u.preferred_language, u.created_at
ORDER BY total_points DESC, course_completion_rate DESC;

-- Grant access permissions
GRANT SELECT ON user_progress_view TO application_role;
