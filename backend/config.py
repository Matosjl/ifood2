import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://db:27017')
DB_NAME = os.environ.get('DB_NAME', 'ifood2')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6379/0')
OWNER_PASSWORD = os.environ.get('OWNER_PASSWORD', 'troque_esta_senha_agora')
OLLAMA_API_URL = os.environ.get('OLLAMA_API_URL', '')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')

