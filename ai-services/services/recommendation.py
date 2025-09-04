import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans
from sqlalchemy import create_engine, text
import redis
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import asyncio

from config.settings import Config
from utils.preprocessing import preprocess_text
from utils.helpers import cache_result

logger = logging.getLogger(__name__)

class RecommendationService:
    def __init__(self):
        self.engine = create_engine(Config.DATABASE_URL)
        self.redis_client = redis.Redis.from_url(Config.REDIS_URL)
        self.vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        self.user_profiles = {}
        self.course_features = {}
        
    async def get_recommendations(
        self, 
        user_id: str, 
        preferences: Dict[str, Any], 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get personalized content recommendations for user"""
        try:
            # Get user profile and history
            user_profile = await self._get_user_profile(user_id)
            learning_history = await self._get_learning_history(user_id)
            
            # Generate different types of recommendations
            course_recommendations = await self._recommend_courses(
                user_profile, learning_history, preferences, limit // 2
            )
            
            news_recommendations = await self._recommend_news(
                user_profile, preferences, limit // 2
            )
            
            # Combine and rank recommendations
            all_recommendations = course_recommendations + news_recommendations
            ranked_recommendations = self._rank_recommendations(
                all_recommendations, user_profile, limit
            )
            
            # Cache results
            cache_key = f"recommendations:{user_id}"
            await self._cache_recommendations(cache_key, ranked_recommendations)
            
            return ranked_recommendations
            
        except Exception as e:
            logger.error(f"Error generating recommendations for user {user_id}: {str(e)}")
            raise

    async def _get_user_profile(self, user_id: str) -> Dict[str, Any]:
        """Get comprehensive user profile"""
        cache_key = f"user_profile:{user_id}"
        cached_profile = self.redis_client.get(cache_key)
        
        if cached_profile:
            return json.loads(cached_profile)
        
        with self.engine.connect() as conn:
            # Get user basic info
            user_query = text("""
                SELECT u.*, up.preferences, up.risk_profile, up.investment_experience
                FROM users u
                LEFT JOIN user_preferences up ON u.id = up.user_id
                WHERE u.id = :user_id
            """)
            user_data = conn.execute(user_query, {"user_id": user_id}).fetchone()
            
            # Get learning progress
            learning_query = text("""
                SELECT c.category, c.level, COUNT(*) as completed_courses,
                       AVG(ar.percentage) as avg_score
                FROM enrollments e
                JOIN courses c ON e.course_id = c.id
                LEFT JOIN assessment_results ar ON ar.user_id = e.user_id
                WHERE e.user_id = :user_id AND e.completed_at IS NOT NULL
                GROUP BY c.category, c.level
            """)
            learning_data = conn.execute(learning_query, {"user_id": user_id}).fetchall()
            
            # Get trading behavior
            trading_query = text("""
                SELECT symbol, COUNT(*) as trade_count, 
                       AVG(executed_price * quantity) as avg_trade_size,
                       SUM(CASE WHEN type = 'BUY' THEN 1 ELSE 0 END) as buy_count,
                       SUM(CASE WHEN type = 'SELL' THEN 1 ELSE 0 END) as sell_count
                FROM trades
                WHERE user_id = :user_id AND status = 'EXECUTED'
                GROUP BY symbol
                ORDER BY trade_count DESC
                LIMIT 20
            """)
            trading_data = conn.execute(trading_query, {"user_id": user_id}).fetchall()
            
            profile = {
                "user_data": dict(user_data) if user_data else {},
                "learning_progress": [dict(row) for row in learning_data],
                "trading_behavior": [dict(row) for row in trading_data],
                "interests": self._extract_interests(learning_data, trading_data),
                "skill_level": self._determine_skill_level(learning_data),
                "risk_profile": user_data.risk_profile if user_data else "moderate",
                "preferred_categories": self._get_preferred_categories(learning_data)
            }
            
            # Cache for 1 hour
            self.redis_client.setex(cache_key, 3600, json.dumps(profile))
            return profile

    async def _recommend_courses(
        self, 
        user_profile: Dict[str, Any], 
        learning_history: List[Dict[str, Any]], 
        preferences: Dict[str, Any], 
        limit: int
    ) -> List[Dict[str, Any]]:
        """Recommend courses based on user profile and learning history"""
        
        with self.engine.connect() as conn:
            # Get available courses
            courses_query = text("""
                SELECT c.*, AVG(cr.rating) as avg_rating, COUNT(cr.id) as review_count
                FROM courses c
                LEFT JOIN course_reviews cr ON c.id = cr.course_id
                WHERE c.status = 'PUBLISHED' AND c.id NOT IN (
                    SELECT course_id FROM enrollments 
                    WHERE user_id = :user_id AND completed_at IS NOT NULL
                )
                GROUP BY c.id
            """)
            courses = conn.execute(courses_query, {"user_id": user_profile["user_data"]["id"]}).fetchall()
        
        # Convert to DataFrame for easier processing
        df_courses = pd.DataFrame([dict(course) for course in courses])
        
        if df_courses.empty:
            return []
        
        # Calculate course scores
        course_scores = []
        for _, course in df_courses.iterrows():
            score = self._calculate_course_score(course, user_profile, preferences)
            course_scores.append({
                "item_id": course["id"],
                "item_type": "course",
                "title": course["title"],
                "description": course["description"],
                "category": course["category"],
                "level": course["level"],
                "rating": course["avg_rating"] or 0,
                "score": score,
                "reason": self._get_recommendation_reason(course, user_profile)
            })
        
        # Sort by score and return top results
        course_scores.sort(key=lambda x: x["score"], reverse=True)
        return course_scores[:limit]

    async def _recommend_news(
        self, 
        user_profile: Dict[str, Any], 
        preferences: Dict[str, Any], 
        limit: int
    ) -> List[Dict[str, Any]]:
        """Recommend news articles based on user interests"""
        
        with self.engine.connect() as conn:
            # Get recent news
            news_query = text("""
                SELECT * FROM news
                WHERE published_at >= :since_date
                ORDER BY published_at DESC
                LIMIT 100
            """)
            since_date = datetime.now() - timedelta(days=7)
            news_articles = conn.execute(news_query, {"since_date": since_date}).fetchall()
        
        if not news_articles:
            return []
        
        # Calculate news scores
        news_scores = []
        user_interests = user_profile.get("interests", [])
        
        for article in news_articles:
            score = self._calculate_news_score(dict(article), user_interests)
            news_scores.append({
                "item_id": article.id,
                "item_type": "news",
                "title": article.title,
                "summary": article.summary,
                "category": article.category,
                "sentiment": article.sentiment,
                "published_at": article.published_at,
                "score": score,
                "reason": "Based on your trading activity and interests"
            })
        
        # Sort by score and return top results
        news_scores.sort(key=lambda x: x["score"], reverse=True)
        return news_scores[:limit]

    def _calculate_course_score(
        self, 
        course: pd.Series, 
        user_profile: Dict[str, Any], 
        preferences: Dict[str, Any]
    ) -> float:
        """Calculate recommendation score for a course"""
        score = 0.0
        
        # Category preference
        preferred_categories = user_profile.get("preferred_categories", [])
        if course["category"] in preferred_categories:
            score += 0.3
        
        # Level appropriateness
        user_skill_level = user_profile.get("skill_level", "beginner")
        level_mapping = {"beginner": 1, "intermediate": 2, "advanced": 3}
        user_level = level_mapping.get(user_skill_level, 1)
        course_level = level_mapping.get(course["level"], 1)
        
        if course_level == user_level:
            score += 0.25
        elif course_level == user_level + 1:
            score += 0.15
        elif course_level == user_level - 1:
            score += 0.1
        
        # Rating and popularity
        rating = course["avg_rating"] or 0
        review_count = course["review_count"] or 0
        score += (rating / 5.0) * 0.2
        score += min(review_count / 100.0, 0.1)  # Popularity bonus
        
        # Recency
        if course["created_at"]:
            days_old = (datetime.now() - course["created_at"]).days
            if days_old < 30:
                score += 0.1
            elif days_old < 90:
                score += 0.05
        
        # Personal preferences
        if preferences.get("preferred_language") == course.get("language"):
            score += 0.1
        
        return min(score, 1.0)

    def _calculate_news_score(
        self, 
        article: Dict[str, Any], 
        user_interests: List[str]
    ) -> float:
        """Calculate recommendation score for a news article"""
        score = 0.0
        
        # Interest matching
        article_text = f"{article['title']} {article['summary']}".lower()
        for interest in user_interests:
            if interest.lower() in article_text:
                score += 0.3
        
        # Category relevance
        if article["category"] in ["stocks", "mutual_funds", "trading", "investment"]:
            score += 0.2
        
        # Sentiment consideration
        if article.get("sentiment") == "positive":
            score += 0.1
        elif article.get("sentiment") == "neutral":
            score += 0.05
        
        # Recency
        if article.get("published_at"):
            hours_old = (datetime.now() - article["published_at"]).total_seconds() / 3600
            if hours_old < 24:
                score += 0.2
            elif hours_old < 72:
                score += 0.1
        
        return min(score, 1.0)

    def _rank_recommendations(
        self, 
        recommendations: List[Dict[str, Any]], 
        user_profile: Dict[str, Any], 
        limit: int
    ) -> List[Dict[str, Any]]:
        """Final ranking of all recommendations"""
        # Sort by score
        ranked = sorted(recommendations, key=lambda x: x["score"], reverse=True)
        
        # Ensure diversity (no more than 60% of one type)
        final_recommendations = []
        type_counts = {}
        
        for rec in ranked:
            item_type = rec["item_type"]
            type_counts[item_type] = type_counts.get(item_type, 0)
            
            if len(final_recommendations) < limit:
                if type_counts[item_type] < limit * 0.6:
                    final_recommendations.append(rec)
                    type_counts[item_type] += 1
        
        return final_recommendations

    def _extract_interests(
        self, 
        learning_data: List[Dict[str, Any]], 
        trading_data: List[Dict[str, Any]]
    ) -> List[str]:
        """Extract user interests from learning and trading data"""
        interests = set()
        
        # From learning data
        for item in learning_data:
            interests.add(item["category"])
        
        # From trading data
        for trade in trading_data:
            # Extract sector/industry from symbol (simplified)
            symbol = trade["symbol"]
            if symbol.startswith("BANK"):
                interests.add("banking")
            elif symbol.startswith("IT"):
                interests.add("technology")
            # Add more sector mappings as needed
        
        return list(interests)

    def _determine_skill_level(self, learning_data: List[Dict[str, Any]]) -> str:
        """Determine user's skill level based on learning progress"""
        if not learning_data:
            return "beginner"
        
        total_courses = sum(item["completed_courses"] for item in learning_data)
        avg_score = np.mean([item["avg_score"] for item in learning_data if item["avg_score"]])
        
        if total_courses >= 10 and avg_score >= 80:
            return "advanced"
        elif total_courses >= 5 and avg_score >= 70:
            return "intermediate"
        else:
            return "beginner"

    def _get_preferred_categories(self, learning_data: List[Dict[str, Any]]) -> List[str]:
        """Get user's preferred learning categories"""
        if not learning_data:
            return []
        
        # Sort by number of completed courses
        sorted_categories = sorted(
            learning_data, 
            key=lambda x: x["completed_courses"], 
            reverse=True
        )
        
        return [item["category"] for item in sorted_categories[:3]]

    def _get_recommendation_reason(
        self, 
        course: pd.Series, 
        user_profile: Dict[str, Any]
    ) -> str:
        """Generate explanation for why this course is recommended"""
        reasons = []
        
        if course["category"] in user_profile.get("preferred_categories", []):
            reasons.append(f"matches your interest in {course['category']}")
        
        if course["level"] == user_profile.get("skill_level"):
            reasons.append("appropriate for your skill level")
        
        if course["avg_rating"] and course["avg_rating"] >= 4.0:
            reasons.append("highly rated by other users")
        
        if not reasons:
            reasons.append("recommended based on your profile")
        
        return "Recommended because it " + " and ".join(reasons)

    async def _cache_recommendations(
        self, 
        cache_key: str, 
        recommendations: List[Dict[str, Any]]
    ):
        """Cache recommendations for faster access"""
        try:
            self.redis_client.setex(
                cache_key, 
                1800,  # 30 minutes
                json.dumps(recommendations, default=str)
            )
        except Exception as e:
            logger.error(f"Error caching recommendations: {str(e)}")

    async def _get_learning_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Get user's learning history"""
        with self.engine.connect() as conn:
            query = text("""
                SELECT c.id, c.title, c.category, c.level, e.completed_at,
                       lp.time_spent, ar.percentage as score
                FROM enrollments e
                JOIN courses c ON e.course_id = c.id
                LEFT JOIN learning_progress lp ON lp.user_id = e.user_id
                LEFT JOIN assessment_results ar ON ar.user_id = e.user_id
                WHERE e.user_id = :user_id
                ORDER BY e.completed_at DESC
                LIMIT 50
            """)
            result = conn.execute(query, {"user_id": user_id}).fetchall()
            return [dict(row) for row in result]

    def update_user_feedback(
        self, 
        user_id: str, 
        item_id: str, 
        feedback_type: str, 
        rating: Optional[float] = None
    ):
        """Update recommendation model based on user feedback"""
        try:
            feedback_data = {
                "user_id": user_id,
                "item_id": item_id,
                "feedback_type": feedback_type,  # 'like', 'dislike', 'view', 'complete'
                "rating": rating,
                "timestamp": datetime.now()
            }
            
            # Store feedback in Redis for real-time updates
            feedback_key = f"feedback:{user_id}:{item_id}"
            self.redis_client.setex(
                feedback_key, 
                86400,  # 24 hours
                json.dumps(feedback_data, default=str)
            )
            
            # Invalidate user's recommendation cache
            cache_key = f"recommendations:{user_id}"
            self.redis_client.delete(cache_key)
            
        except Exception as e:
            logger.error(f"Error updating user feedback: {str(e)}")
