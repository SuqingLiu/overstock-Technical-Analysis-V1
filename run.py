from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import numpy as np
import pandas as pd
from pymongo import MongoClient

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------
# 0) SETTING UP MONGO CONNECTION
# ---------------------------------------------------
# Adjust the connection URI to point to your MongoDB instance.
# e.g., "mongodb://localhost:27017" for a local DB with the default port
# or "mongodb+srv://<username>:<password>@cluster0.mongodb.net/<dbname>?retryWrites=true&w=majority"
mongo_client = MongoClient("mongodb://localhost:27017")

# The database name: "stockDB" for instance
mongo_db = mongo_client["stockDB"]

# The collection where we'll store user info & tickers
# For example: each document in this collection might look like:
#   {
#       "username": "alice",
#       "tickers": ["AAPL", "GOOG", "TSLA"]
#   }
users_collection = mongo_db["users"]


@app.route('/status', methods=['POST'])
def status():
    data = request.get_json()
    ticker = data.get('ticker')

    if not ticker:
        return jsonify({'error': 'Ticker is required'}), 400

    # ---------------------------------------------------
    # 1) FETCH DAILY DATA FOR MULTI-DAY MAs (5, 25, 99)
    # ---------------------------------------------------
    daily_df = yf.download(ticker, period="120d", interval="1d", auto_adjust=False)

    # Flatten multi-index columns if present
    if isinstance(daily_df.columns, pd.MultiIndex):
        daily_df.columns = daily_df.columns.get_level_values(0)

    daily_df.dropna(subset=["Close"], inplace=True)
    if daily_df.empty:
        return jsonify({'error': f"No daily data found for '{ticker}'"}), 404

    # Compute daily MAs
    daily_df['MA_5'] = daily_df['Close'].rolling(5).mean()
    daily_df['MA_25'] = daily_df['Close'].rolling(25).mean()
    daily_df['MA_99'] = daily_df['Close'].rolling(99).mean()

    # Grab the latest daily row for MAs
    latest_daily_row = daily_df.iloc[-1]
    ma_5_daily = float(latest_daily_row['MA_5']) if not pd.isna(latest_daily_row['MA_5']) else None
    ma_25_daily = float(latest_daily_row['MA_25']) if not pd.isna(latest_daily_row['MA_25']) else None
    ma_99_daily = float(latest_daily_row['MA_99']) if not pd.isna(latest_daily_row['MA_99']) else None

    # ---------------------------------------------------
    # 2) FETCH INTRADAY DATA FOR NEAR REAL-TIME PRICE
    # ---------------------------------------------------
    intraday_df = yf.download(ticker, period="5d", interval="5m", prepost=True)

    if isinstance(intraday_df.columns, pd.MultiIndex):
        intraday_df.columns = intraday_df.columns.get_level_values(0)

    intraday_df.dropna(subset=["Close"], inplace=True)
    if intraday_df.empty:
        current_close = float(latest_daily_row['Close'])
    else:
        latest_intra_row = intraday_df.iloc[-1]
        current_close = float(latest_intra_row['Close'])

    # ---------------------------------------------------
    # 3) SIGNAL LOGIC (INTRADAY PRICE vs. DAILY MAs)
    # ---------------------------------------------------
    decision = "Hold"
    reason = "No strong signal detected."

    # A) BUY if intraday price > daily MA_5 and intraday price > daily MA_25
    if ma_5_daily is not None and ma_25_daily is not None:
        if (current_close > ma_5_daily) and (current_close > ma_25_daily):
            decision = "Buy"
            reason = "Current intraday price above both 5-day and 25-day MAs (Daily)."

    # B) SELL if intraday price < daily MA_25
    if ma_25_daily is not None and (current_close < ma_25_daily):
        decision = "Exit"
        reason = "Current intraday price dropped below 25-day MA (Daily)."

    # ---------------------------------------------------
    # 4) GOLDEN CROSS DETECTION (DAILY MAs)
    # ---------------------------------------------------
    if len(daily_df) >= 2:
        prev_daily_row = daily_df.iloc[-2]
        ma_25_prev = float(prev_daily_row['MA_25']) if not pd.isna(prev_daily_row['MA_25']) else None
        ma_99_prev = float(prev_daily_row['MA_99']) if not pd.isna(prev_daily_row['MA_99']) else None
    else:
        ma_25_prev = None
        ma_99_prev = None

    if (ma_25_daily is not None and ma_99_daily is not None and
        ma_25_prev is not None and ma_99_prev is not None):

        cross_today = (ma_25_daily > ma_99_daily)
        cross_yest = (ma_25_prev <= ma_99_prev)
        if cross_today and cross_yest:
            if current_close > ma_25_daily:
                decision = "Buy More"
                reason = "Golden cross detected (25-day MA crossed above 99-day MA)."

    # ---------------------------------------------------
    # 5) DIP-BUY LOGIC (CURRENT PRICE vs. RECENT DAILY HIGH)
    # ---------------------------------------------------
    daily_df['recent_high'] = daily_df['Close'].rolling(5).max()
    last_daily = daily_df.iloc[-1]
    recent_high_val = float(last_daily['recent_high']) if not pd.isna(last_daily['recent_high']) else None

    if (recent_high_val is not None and recent_high_val > 0
        and ma_25_daily is not None
        and current_close > ma_25_daily):

        price_drop_percentage = (recent_high_val - current_close) / recent_high_val
        if price_drop_percentage >= 0.05:
            decision = "Buy More"
            reason = "Price dropped by ≥5% from recent daily high but is still above 25-day MA (Daily)."

    response = {
        'ticker': ticker,
        'decision': decision,
        'reason': reason,
        'current_price': round(current_close, 2),
        'MA_5': round(ma_5_daily, 2) if ma_5_daily is not None else None,
        'MA_25': round(ma_25_daily, 2) if ma_25_daily is not None else None,
        'MA_99': round(ma_99_daily, 2) if ma_99_daily is not None else None
    }

    return jsonify(response)


# ---------------------------------------------------
# NEW ENDPOINTS FOR MONGODB USER/TICKER MANAGEMENT
# ---------------------------------------------------

@app.route('/add_ticker', methods=['POST'])
def add_ticker():
    """
    JSON body should contain:
    {
      "username": "<string>",
      "ticker": "<string>"
    }
    """
    data = request.get_json()
    username = data.get('username')
    ticker = data.get('ticker')

    if not username or not ticker:
        return jsonify({'error': 'username and ticker are required'}), 400

    # Convert ticker to uppercase, just for consistency
    ticker = ticker.upper()

    # Upsert user:
    # - If the user doesn't exist, create a new doc with the username and an array with the new ticker.
    # - If the user does exist, push the ticker into the array if it's not already there.
    users_collection.update_one(
        {'username': username},
        {'$addToSet': {'tickers': ticker}},
        upsert=True
    )

    return jsonify({'message': f'{ticker} added for user {username}'}), 200


@app.route('/delete_ticker', methods=['POST'])
def delete_ticker():
    """
    JSON body should contain:
    {
      "username": "<string>",
      "ticker": "<string>"
    }
    """
    data = request.get_json()
    username = data.get('username')
    ticker = data.get('ticker')

    if not username or not ticker:
        return jsonify({'error': 'username and ticker are required'}), 400

    ticker = ticker.upper()

    # Remove ticker from user's list
    result = users_collection.update_one(
        {'username': username},
        {'$pull': {'tickers': ticker}}
    )

    if result.modified_count == 0:
        return jsonify({'message': 'No changes made. Possibly user or ticker did not exist.'}), 404

    return jsonify({'message': f'{ticker} removed from user {username}'}), 200


@app.route('/tickers/<string:username>', methods=['GET'])
def get_tickers(username):
    """
    GET all tickers saved for a given user.
    Example request: GET /tickers/alice
    """
    user_doc = users_collection.find_one({'username': username})
    if not user_doc:
        return jsonify({'message': f'No user found with username={username}'}), 404

    tickers = user_doc.get('tickers', [])
    return jsonify({
        'username': username,
        'tickers': tickers
    }), 200


if __name__ == '__main__':
    # Ensure your MongoDB server is running before starting the Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)
