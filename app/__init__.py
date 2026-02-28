from flask import Flask
import os
from .routes import main_bp

def create_app():
    app = Flask(__name__)
    app.config["AIRNOW_API_KEY"] = os.getenv("AIRNOW_API_KEY")
    app.config["GEOCODIO_API_KEY"] = os.getenv("GEOCODIO_API_KEY")
    app.register_blueprint(main_bp)
    
    
    return app
