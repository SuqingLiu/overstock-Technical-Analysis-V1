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
mongo_client = MongoClient("mongodb://localhost:27017")
mongo_db = mongo_client["stockDB"]
users_collection = mongo_db["users"]

@app.route('/status', methods=['POST'])
def status():
    data = request.get_json()
    ticker = data.get('ticker')

    if not ticker:
        return jsonify({'error': 'Ticker is required'}), 400

    # ---------------------------------------------------
    # 1) FETCH DAILY DATA & CALCULATE MOVING AVERAGES (UNCHANGED)
    # ---------------------------------------------------
    daily_df = yf.download(ticker, period="120d", interval="1d", auto_adjust=False)
    if isinstance(daily_df.columns, pd.MultiIndex):
        daily_df.columns = daily_df.columns.get_level_values(0)
    daily_df.dropna(subset=["Close"], inplace=True)
    if daily_df.empty:
        return jsonify({'error': f"No daily data found for '{ticker}'"}), 404

    daily_df['MA_5'] = daily_df['Close'].rolling(5).mean()
    daily_df['MA_25'] = daily_df['Close'].rolling(25).mean()
    daily_df['MA_99'] = daily_df['Close'].rolling(99).mean()

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
    # 3) SIGNAL LOGIC BASED ON MOVING AVERAGES (UNCHANGED)
    # ---------------------------------------------------
    decision = "Hold"
    reason = "No strong signal detected."

    # A) BUY if intraday price > daily MA_5 and daily MA_25
    if ma_5_daily is not None and ma_25_daily is not None:
        if (current_close > ma_5_daily) and (current_close > ma_25_daily):
            decision = "Buy"
            reason = "Current intraday price above both 5-day and 25-day MAs (Daily)."

    # B) SELL if intraday price < daily MA_25
    if ma_25_daily is not None and (current_close < ma_25_daily):
        decision = "Exit"
        reason = "Current intraday price dropped below 25-day MA (Daily)."

    # ---------------------------------------------------
    # 4) GOLDEN CROSS DETECTION (UNCHANGED)
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
    # 5) DIP-BUY LOGIC (UNCHANGED)
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

    # ---------------------------------------------------
    # 6) ADDITIONAL TECHNICAL INDICATOR CHECKS
    # ---------------------------------------------------
    # (A) RSI Calculation (14-day period)
    delta = daily_df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss
    daily_df['RSI'] = 100 - (100 / (1 + rs))
    latest_rsi = float(daily_df.iloc[-1]['RSI']) if not pd.isna(daily_df.iloc[-1]['RSI']) else None

    # (B) MACD Calculation (12, 26, 9)
    ema_12 = daily_df['Close'].ewm(span=12, adjust=False).mean()
    ema_26 = daily_df['Close'].ewm(span=26, adjust=False).mean()
    daily_df['MACD'] = ema_12 - ema_26
    daily_df['MACD_signal'] = daily_df['MACD'].ewm(span=9, adjust=False).mean()
    latest_macd = float(daily_df.iloc[-1]['MACD'])
    latest_macd_signal = float(daily_df.iloc[-1]['MACD_signal'])
    if len(daily_df) >= 2:
        prev_macd = float(daily_df.iloc[-2]['MACD'])
        prev_macd_signal = float(daily_df.iloc[-2]['MACD_signal'])
    else:
        prev_macd = prev_macd_signal = None

    # (C) Bollinger Bands (20-day period)
    daily_df['BB_middle'] = daily_df['Close'].rolling(20).mean()
    daily_df['BB_std'] = daily_df['Close'].rolling(20).std()
    daily_df['BB_upper'] = daily_df['BB_middle'] + 2 * daily_df['BB_std']
    daily_df['BB_lower'] = daily_df['BB_middle'] - 2 * daily_df['BB_std']
    latest_bb_upper = float(daily_df.iloc[-1]['BB_upper'])
    latest_bb_lower = float(daily_df.iloc[-1]['BB_lower'])

    # (D) OBV Calculation
    daily_df['OBV'] = (np.sign(daily_df['Close'].diff()) * daily_df['Volume']).fillna(0).cumsum()
    obv_change = (daily_df.iloc[-1]['OBV'] - daily_df.iloc[-2]['OBV']) if len(daily_df) >= 2 else 0

    # (E) Fibonacci Retracement Levels based on period high/low
    max_close = daily_df['Close'].max()
    min_close = daily_df['Close'].min()
    diff = max_close - min_close
    fibo_levels = {
        "23.6%": max_close - 0.236 * diff,
        "38.2%": max_close - 0.382 * diff,
        "50.0%": max_close - 0.5 * diff,
        "61.8%": max_close - 0.618 * diff,
        "78.6%": max_close - 0.786 * diff,
    }

    # ---------------------------------------------------
    # 7) COMBINE ADDITIONAL INDICATOR SIGNALS INTO REASONING
    # ---------------------------------------------------
    indicator_signals = []

    if latest_rsi is not None:
        if latest_rsi < 30:
            indicator_signals.append(f"RSI is low ({latest_rsi:.2f}), indicating oversold conditions.")
        elif latest_rsi > 70:
            indicator_signals.append(f"RSI is high ({latest_rsi:.2f}), indicating overbought conditions.")

    if prev_macd is not None and prev_macd_signal is not None:
        if (prev_macd < prev_macd_signal) and (latest_macd > latest_macd_signal):
            indicator_signals.append("MACD bullish crossover detected.")
        elif (prev_macd > prev_macd_signal) and (latest_macd < latest_macd_signal):
            indicator_signals.append("MACD bearish crossover detected.")

    if current_close > latest_bb_upper:
        indicator_signals.append("Price is above the upper Bollinger Band, suggesting a breakout.")
    elif current_close < latest_bb_lower:
        indicator_signals.append("Price is below the lower Bollinger Band, suggesting potential reversal.")

    if obv_change > 0:
        indicator_signals.append("Rising OBV supports upward momentum.")
    elif obv_change < 0:
        indicator_signals.append("Declining OBV may signal weakening buying pressure.")

    # Check if current price is near any Fibonacci retracement level (within ~1% tolerance)
    for level, value in fibo_levels.items():
        if abs(current_close - value) / value < 0.01:
            indicator_signals.append(f"Price is near the {level} Fibonacci retracement level.")
            break

    if indicator_signals:
        additional_reason = " ".join(indicator_signals)
        reason += " " + additional_reason

    # ---------------------------------------------------
    # 8) BUILD EXTENDED RESPONSE INCLUDING INDICATOR DETAILS
    # ---------------------------------------------------
    response = {
        'ticker': ticker,
        'decision': decision,
        'reason': reason,
        'current_price': round(current_close, 2),
        'MA_5': round(ma_5_daily, 2) if ma_5_daily is not None else None,
        'MA_25': round(ma_25_daily, 2) if ma_25_daily is not None else None,
        'MA_99': round(ma_99_daily, 2) if ma_99_daily is not None else None,
        'indicators': {
            'RSI': latest_rsi,
            'MACD': {'macd': latest_macd, 'signal': latest_macd_signal},
            'BollingerBands': {'upper': latest_bb_upper, 'lower': latest_bb_lower},
            'OBV_change': obv_change,
            'Fibonacci_levels': fibo_levels
        }
    }
    return jsonify(response)

# ---------------------------------------------------
# NEW ENDPOINTS FOR MONGODB USER/TICKER MANAGEMENT (UNCHANGED)
# ---------------------------------------------------

@app.route('/add_ticker', methods=['POST'])
def add_ticker():
    data = request.get_json()
    username = data.get('username')
    ticker = data.get('ticker')

    if not username or not ticker:
        return jsonify({'error': 'username and ticker are required'}), 400

    ticker = ticker.upper()

    users_collection.update_one(
        {'username': username},
        {'$addToSet': {'tickers': ticker}},
        upsert=True
    )
    return jsonify({'message': f'{ticker} added for user {username}'}), 200

@app.route('/delete_ticker', methods=['POST'])
def delete_ticker():
    data = request.get_json()
    username = data.get('username')
    ticker = data.get('ticker')

    if not username or not ticker:
        return jsonify({'error': 'username and ticker are required'}), 400

    ticker = ticker.upper()

    result = users_collection.update_one(
        {'username': username},
        {'$pull': {'tickers': ticker}}
    )
    if result.modified_count == 0:
        return jsonify({'message': 'No changes made. Possibly user or ticker did not exist.'}), 404
    return jsonify({'message': f'{ticker} removed from user {username}'}), 200

@app.route('/tickers/<string:username>', methods=['GET'])
def get_tickers(username):
    user_doc = users_collection.find_one({'username': username})
    if not user_doc:
        return jsonify({'message': f'No user found with username={username}'}), 404
    tickers = user_doc.get('tickers', [])
    return jsonify({'username': username, 'tickers': tickers}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
