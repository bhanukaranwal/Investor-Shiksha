# ai-services/services/sentiment.py
import numpy as np
import pandas as pd
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
import spacy
import re
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
import asyncio
import aioredis
from sqlalchemy import create_engine, text

from config.settings import Config
from utils.preprocessing import preprocess_text, clean_financial_text
from utils.helpers import cache_result

logger = logging.getLogger(__name__)

class SentimentService:
    def __init__(self):
        self.engine = create_engine(Config.DATABASE_URL)
        self.redis_client = None
        self._init_models()
        self._init_financial_keywords()
        
    async def _get_redis(self):
        if not self.redis_client:
            self.redis_client = aioredis.from_url(Config.REDIS_URL)
        return self.redis_client
    
    def _init_models(self):
        """Initialize sentiment analysis models"""
        try:
            # VADER for quick sentiment analysis
            self.vader_analyzer = SentimentIntensityAnalyzer()
            
            # FinBERT for financial sentiment analysis
            self.finbert_tokenizer = AutoTokenizer.from_pretrained("yiyanghkust/finbert-tone")
            self.finbert_model = AutoModelForSequenceClassification.from_pretrained("yiyanghkust/finbert-tone")
            self.finbert_pipeline = pipeline(
                "sentiment-analysis",
                model=self.finbert_model,
                tokenizer=self.finbert_tokenizer
            )
            
            # General sentiment pipeline
            self.general_pipeline = pipeline(
                "sentiment-analysis", 
                model="cardiffnlp/twitter-roberta-base-sentiment-latest"
            )
            
            # Load spaCy model for NER
            self.nlp = spacy.load("en_core_web_sm")
            
            logger.info("Sentiment analysis models loaded successfully")
            
        except Exception as e:
            logger.error(f"Error loading sentiment models: {str(e)}")
            raise
    
    def _init_financial_keywords(self):
        """Initialize financial sentiment keywords"""
        self.positive_keywords = [
            'profit', 'gain', 'growth', 'bull', 'rise', 'increase', 'positive',
            'strong', 'beat', 'exceed', 'outperform', 'surge', 'rally', 'boom',
            'bullish', 'uptrend', 'breakthrough', 'milestone', 'achievement'
        ]
        
        self.negative_keywords = [
            'loss', 'decline', 'bear', 'fall', 'decrease', 'negative', 'weak',
            'miss', 'underperform', 'crash', 'plunge', 'recession', 'bearish',
            'downtrend', 'crisis', 'risk', 'concern', 'worry', 'trouble'
        ]
        
        self.neutral_keywords = [
            'stable', 'unchanged', 'flat', 'sideways', 'consolidate', 'range',
            'maintain', 'steady', 'consistent', 'regular', 'normal'
        ]

    async def analyze_sentiment(
        self, 
        text: str, 
        include_entities: bool = False,
        model_type: str = 'ensemble'
    ) -> Dict[str, Any]:
        """
        Comprehensive sentiment analysis with multiple models
        """
        try:
            # Preprocess text
            processed_text = clean_financial_text(text)
            
            # Get cached result if available
            cache_key = f"sentiment:{hash(text)}:{model_type}"
            redis = await self._get_redis()
            cached_result = await redis.get(cache_key)
            
            if cached_result:
                return eval(cached_result.decode())
            
            # Analyze sentiment using multiple approaches
            results = {}
            
            if model_type in ['vader', 'ensemble']:
                results['vader'] = self._analyze_with_vader(processed_text)
            
            if model_type in ['finbert', 'ensemble']:
                results['finbert'] = self._analyze_with_finbert(processed_text)
            
            if model_type in ['general', 'ensemble']:
                results['general'] = self._analyze_with_general_model(processed_text)
            
            # Rule-based financial sentiment
            results['rule_based'] = self._analyze_with_rules(processed_text)
            
            # Ensemble result
            if model_type == 'ensemble':
                results['ensemble'] = self._create_ensemble_result(results)
            
            # Extract entities if requested
            if include_entities:
                results['entities'] = self._extract_entities(text)
            
            # Add metadata
            results['metadata'] = {
                'text_length': len(text),
                'processed_length': len(processed_text),
                'timestamp': datetime.now().isoformat(),
                'model_type': model_type
            }
            
            # Cache result for 1 hour
            await redis.setex(cache_key, 3600, str(results))
            
            return results
            
        except Exception as e:
            logger.error(f"Error in sentiment analysis: {str(e)}")
            raise

    def _analyze_with_vader(self, text: str) -> Dict[str, Any]:
        """VADER sentiment analysis"""
        scores = self.vader_analyzer.polarity_scores(text)
        
        # Determine sentiment label
        if scores['compound'] >= 0.05:
            sentiment = 'positive'
        elif scores['compound'] <= -0.05:
            sentiment = 'negative'
        else:
            sentiment = 'neutral'
        
        return {
            'sentiment': sentiment,
            'confidence': abs(scores['compound']),
            'scores': scores
        }

    def _analyze_with_finbert(self, text: str) -> Dict[str, Any]:
        """FinBERT financial sentiment analysis"""
        try:
            # Split long text into chunks
            chunks = self._split_text(text, max_length=512)
            chunk_results = []
            
            for chunk in chunks:
                result = self.finbert_pipeline(chunk)[0]
                chunk_results.append({
                    'label': result['label'].lower(),
                    'score': result['score']
                })
            
            # Aggregate results
            if len(chunk_results) == 1:
                final_result = chunk_results[0]
            else:
                final_result = self._aggregate_chunk_results(chunk_results)
            
            return {
                'sentiment': final_result['label'],
                'confidence': final_result['score'],
                'chunks_analyzed': len(chunks)
            }
            
        except Exception as e:
            logger.error(f"FinBERT analysis error: {str(e)}")
            return {'sentiment': 'neutral', 'confidence': 0.5, 'error': str(e)}

    def _analyze_with_general_model(self, text: str) -> Dict[str, Any]:
        """General sentiment analysis"""
        try:
            chunks = self._split_text(text, max_length=512)
            chunk_results = []
            
            for chunk in chunks:
                result = self.general_pipeline(chunk)[0]
                # Map labels to standard format
                label_mapping = {
                    'LABEL_0': 'negative',
                    'LABEL_1': 'neutral', 
                    'LABEL_2': 'positive',
                    'NEGATIVE': 'negative',
                    'NEUTRAL': 'neutral',
                    'POSITIVE': 'positive'
                }
                
                mapped_label = label_mapping.get(result['label'], result['label'].lower())
                chunk_results.append({
                    'label': mapped_label,
                    'score': result['score']
                })
            
            # Aggregate results
            if len(chunk_results) == 1:
                final_result = chunk_results[0]
            else:
                final_result = self._aggregate_chunk_results(chunk_results)
            
            return {
                'sentiment': final_result['label'],
                'confidence': final_result['score'],
                'chunks_analyzed': len(chunks)
            }
            
        except Exception as e:
            logger.error(f"General model analysis error: {str(e)}")
            return {'sentiment': 'neutral', 'confidence': 0.5, 'error': str(e)}

    def _analyze_with_rules(self, text: str) -> Dict[str, Any]:
        """Rule-based sentiment analysis using financial keywords"""
        text_lower = text.lower()
        words = word_tokenize(text_lower)
        
        positive_count = sum(1 for word in words if word in self.positive_keywords)
        negative_count = sum(1 for word in words if word in words if word in self.negative_keywords)
        neutral_count = sum(1 for word in words if word in self.neutral_keywords)
        
        total_sentiment_words = positive_count + negative_count + neutral_count
        
        if total_sentiment_words == 0:
            return {'sentiment': 'neutral', 'confidence': 0.5, 'keyword_counts': {}}
        
        # Calculate sentiment scores
        pos_score = positive_count / total_sentiment_words
        neg_score = negative_count / total_sentiment_words
        neu_score = neutral_count / total_sentiment_words
        
        # Determine final sentiment
        if pos_score > neg_score and pos_score > neu_score:
            sentiment = 'positive'
            confidence = pos_score
        elif neg_score > pos_score and neg_score > neu_score:
            sentiment = 'negative'
            confidence = neg_score
        else:
            sentiment = 'neutral'
            confidence = max(neu_score, 0.5)
        
        return {
            'sentiment': sentiment,
            'confidence': confidence,
            'keyword_counts': {
                'positive': positive_count,
                'negative': negative_count,
                'neutral': neutral_count
            },
            'scores': {
                'positive': pos_score,
                'negative': neg_score,
                'neutral': neu_score
            }
        }

    def _create_ensemble_result(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Create ensemble result from multiple models"""
        sentiments = []
        confidences = []
        
        # Collect results from different models
        for model in ['vader', 'finbert', 'general', 'rule_based']:
            if model in results and 'sentiment' in results[model]:
                sentiments.append(results[model]['sentiment'])
                confidences.append(results[model]['confidence'])
        
        if not sentiments:
            return {'sentiment': 'neutral', 'confidence': 0.5}
        
        # Weight the models (FinBERT gets higher weight for financial text)
        weights = {
            'finbert': 0.4,
            'vader': 0.25,
            'general': 0.2,
            'rule_based': 0.15
        }
        
        # Calculate weighted sentiment
        sentiment_scores = {'positive': 0, 'negative': 0, 'neutral': 0}
        total_weight = 0
        
        for i, model in enumerate(['vader', 'finbert', 'general', 'rule_based']):
            if model in results:
                weight = weights.get(model, 0.25)
                sentiment = results[model]['sentiment']
                confidence = results[model]['confidence']
                
                sentiment_scores[sentiment] += weight * confidence
                total_weight += weight
        
        # Normalize scores
        if total_weight > 0:
            for sentiment in sentiment_scores:
                sentiment_scores[sentiment] /= total_weight
        
        # Determine final sentiment
        final_sentiment = max(sentiment_scores, key=sentiment_scores.get)
        final_confidence = sentiment_scores[final_sentiment]
        
        return {
            'sentiment': final_sentiment,
            'confidence': final_confidence,
            'scores': sentiment_scores,
            'models_used': list(results.keys()),
            'total_weight': total_weight
        }

    def _extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract named entities from text"""
        doc = self.nlp(text)
        
        entities = {
            'PERSON': [],
            'ORG': [],
            'MONEY': [],
            'PERCENT': [],
            'DATE': [],
            'GPE': [],  # Geopolitical entity
            'PRODUCT': []
        }
        
        for ent in doc.ents:
            if ent.label_ in entities:
                entities[ent.label_].append({
                    'text': ent.text,
                    'start': ent.start_char,
                    'end': ent.end_char,
                    'confidence': 1.0  # spaCy doesn't provide confidence scores
                })
        
        return entities

    def _split_text(self, text: str, max_length: int = 512) -> List[str]:
        """Split text into chunks for model processing"""
        sentences = sent_tokenize(text)
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            if len(current_chunk + sentence) <= max_length:
                current_chunk += " " + sentence if current_chunk else sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks if chunks else [text[:max_length]]

    def _aggregate_chunk_results(self, chunk_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate sentiment results from multiple chunks"""
        if not chunk_results:
            return {'label': 'neutral', 'score': 0.5}
        
        # Weight by confidence scores
        total_weighted_score = 0
        total_weight = 0
        sentiment_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
        
        for result in chunk_results:
            sentiment = result['label']
            confidence = result['score']
            
            sentiment_counts[sentiment] += confidence
            total_weighted_score += confidence
            total_weight += 1
        
        # Determine overall sentiment
        dominant_sentiment = max(sentiment_counts, key=sentiment_counts.get)
        average_confidence = sentiment_counts[dominant_sentiment] / len(chunk_results)
        
        return {
            'label': dominant_sentiment,
            'score': average_confidence
        }

    async def analyze_batch_sentiment(
        self, 
        texts: List[str], 
        model_type: str = 'ensemble'
    ) -> List[Dict[str, Any]]:
        """Analyze sentiment for multiple texts"""
        try:
            tasks = []
            for text in texts:
                task = self.analyze_sentiment(text, model_type=model_type)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle exceptions
            processed_results = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"Error processing text {i}: {str(result)}")
                    processed_results.append({
                        'sentiment': 'neutral',
                        'confidence': 0.5,
                        'error': str(result)
                    })
                else:
                    processed_results.append(result)
            
            return processed_results
            
        except Exception as e:
            logger.error(f"Error in batch sentiment analysis: {str(e)}")
            raise

    def get_market_sentiment_summary(self, timeframe: str = '1d') -> Dict[str, Any]:
        """Get overall market sentiment summary"""
        try:
            with self.engine.connect() as conn:
                # Get recent news articles
                query = text("""
                    SELECT title, summary, sentiment, published_at, category
                    FROM news 
                    WHERE published_at >= NOW() - INTERVAL :timeframe
                    AND category IN ('market', 'stocks', 'economy')
                    ORDER BY published_at DESC
                """)
                
                news_data = conn.execute(query, {"timeframe": timeframe}).fetchall()
            
            if not news_data:
                return {
                    'overall_sentiment': 'neutral',
                    'confidence': 0.5,
                    'articles_analyzed': 0
                }
            
            # Aggregate sentiment scores
            sentiments = [article.sentiment for article in news_data if article.sentiment]
            sentiment_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
            
            for sentiment in sentiments:
                if sentiment in sentiment_counts:
                    sentiment_counts[sentiment] += 1
            
            total_articles = len(sentiments)
            if total_articles == 0:
                return {
                    'overall_sentiment': 'neutral',
                    'confidence': 0.5,
                    'articles_analyzed': 0
                }
            
            # Calculate percentages
            sentiment_percentages = {
                sentiment: count / total_articles * 100
                for sentiment, count in sentiment_counts.items()
            }
            
            # Determine overall sentiment
            overall_sentiment = max(sentiment_counts, key=sentiment_counts.get)
            confidence = sentiment_counts[overall_sentiment] / total_articles
            
            return {
                'overall_sentiment': overall_sentiment,
                'confidence': confidence,
                'sentiment_breakdown': sentiment_percentages,
                'articles_analyzed': total_articles,
                'timeframe': timeframe,
                'last_updated': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting market sentiment summary: {str(e)}")
            raise
