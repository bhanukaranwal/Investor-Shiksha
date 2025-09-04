import os
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import redis
import logging
from datetime import timedelta
import json

from config.settings import Config
from services.translation import TranslationService
from services.recommendation import RecommendationService
from services.sentiment import SentimentService
from services.risk_profiling import RiskProfilingService
from services.content_analysis import ContentAnalysisService
from services.chatbot import ChatbotService
from services.speech_to_text import SpeechToTextService
from services.text_to_speech import TextToSpeechService
from utils.helpers import error_handler, validate_request
from utils.preprocessing import preprocess_text
from utils.postprocessing import postprocess_response

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
CORS(app, origins=app.config['CORS_ORIGINS'])
jwt = JWTManager(app)

# Initialize rate limiter
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Initialize Redis client
redis_client = redis.Redis.from_url(app.config['REDIS_URL'])

# Initialize services
translation_service = TranslationService()
recommendation_service = RecommendationService()
sentiment_service = SentimentService()
risk_profiling_service = RiskProfilingService()
content_analysis_service = ContentAnalysisService()
chatbot_service = ChatbotService()
speech_to_text_service = SpeechToTextService()
text_to_speech_service = TextToSpeechService()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.errorhandler(Exception)
def handle_exception(e):
    return error_handler(e)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check Redis connection
        redis_client.ping()
        return jsonify({
            'status': 'healthy',
            'services': {
                'redis': 'connected',
                'ai_models': 'loaded'
            },
            'timestamp': str(datetime.utcnow())
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': str(datetime.utcnow())
        }), 500

@app.route('/api/translate', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def translate_text():
    """Translate text to specified language"""
    try:
        data = validate_request(request.json, ['text', 'target_language'])
        
        result = translation_service.translate(
            text=data['text'],
            target_language=data['target_language'],
            source_language=data.get('source_language', 'auto')
        )
        
        return jsonify({
            'success': True,
            'data': result
        }), 200
        
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/recommend', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required()
def get_recommendations():
    """Get personalized content recommendations"""
    try:
        user_id = get_jwt_identity()
        data = validate_request(request.json, ['user_preferences'])
        
        recommendations = recommendation_service.get_recommendations(
            user_id=user_id,
            preferences=data['user_preferences'],
            limit=data.get('limit', 10)
        )
        
        return jsonify({
            'success': True,
            'data': recommendations
        }), 200
        
    except Exception as e:
        logger.error(f"Recommendation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/sentiment', methods=['POST'])
@limiter.limit("30 per minute")
@jwt_required()
def analyze_sentiment():
    """Analyze sentiment of text content"""
    try:
        data = validate_request(request.json, ['text'])
        
        sentiment = sentiment_service.analyze_sentiment(
            text=data['text'],
            include_entities=data.get('include_entities', False)
        )
        
        return jsonify({
            'success': True,
            'data': sentiment
        }), 200
        
    except Exception as e:
        logger.error(f"Sentiment analysis error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/risk-profile', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def assess_risk_profile():
    """Assess user's risk profile based on responses"""
    try:
        user_id = get_jwt_identity()
        data = validate_request(request.json, ['responses'])
        
        risk_profile = risk_profiling_service.assess_risk_profile(
            user_id=user_id,
            responses=data['responses']
        )
        
        return jsonify({
            'success': True,
            'data': risk_profile
        }), 200
        
    except Exception as e:
        logger.error(f"Risk profiling error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/content/analyze', methods=['POST'])
@limiter.limit("15 per minute")
@jwt_required()
def analyze_content():
    """Analyze content quality and extract insights"""
    try:
        data = validate_request(request.json, ['content'])
        
        analysis = content_analysis_service.analyze_content(
            content=data['content'],
            analysis_type=data.get('analysis_type', 'comprehensive')
        )
        
        return jsonify({
            'success': True,
            'data': analysis
        }), 200
        
    except Exception as e:
        logger.error(f"Content analysis error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/chat', methods=['POST'])
@limiter.limit("50 per minute")
@jwt_required()
def chat_with_bot():
    """Chat with AI assistant"""
    try:
        user_id = get_jwt_identity()
        data = validate_request(request.json, ['message'])
        
        response = chatbot_service.process_message(
            user_id=user_id,
            message=data['message'],
            context=data.get('context', {}),
            language=data.get('language', 'en')
        )
        
        return jsonify({
            'success': True,
            'data': response
        }), 200
        
    except Exception as e:
        logger.error(f"Chatbot error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/speech-to-text', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def convert_speech_to_text():
    """Convert speech audio to text"""
    try:
        if 'audio' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No audio file provided'
            }), 400
        
        audio_file = request.files['audio']
        language = request.form.get('language', 'en')
        
        text = speech_to_text_service.convert_audio_to_text(
            audio_file=audio_file,
            language=language
        )
        
        return jsonify({
            'success': True,
            'data': {'text': text}
        }), 200
        
    except Exception as e:
        logger.error(f"Speech-to-text error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/text-to-speech', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def convert_text_to_speech():
    """Convert text to speech audio"""
    try:
        data = validate_request(request.json, ['text'])
        
        audio_url = text_to_speech_service.convert_text_to_speech(
            text=data['text'],
            language=data.get('language', 'en'),
            voice=data.get('voice', 'default')
        )
        
        return jsonify({
            'success': True,
            'data': {'audio_url': audio_url}
        }), 200
        
    except Exception as e:
        logger.error(f"Text-to-speech error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/batch/translate', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def batch_translate():
    """Batch translate multiple texts"""
    try:
        data = validate_request(request.json, ['texts', 'target_language'])
        
        results = translation_service.batch_translate(
            texts=data['texts'],
            target_language=data['target_language'],
            source_language=data.get('source_language', 'auto')
        )
        
        return jsonify({
            'success': True,
            'data': results
        }), 200
        
    except Exception as e:
        logger.error(f"Batch translation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/summarize', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def summarize_content():
    """Summarize long content"""
    try:
        data = validate_request(request.json, ['content'])
        
        summary = content_analysis_service.summarize_content(
            content=data['content'],
            max_length=data.get('max_length', 150),
            language=data.get('language', 'en')
        )
        
        return jsonify({
            'success': True,
            'data': {'summary': summary}
        }), 200
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    app.run(host='0.0.0.0', port=port, debug=debug)
