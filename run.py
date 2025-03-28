from flask import Flask, request, jsonify
import yfinance as yf
import numpy as np
import pandas as pd
from flask_cors import CORS  # <-- Import CORS


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.route('/status', methods=['POST'])
def status():
    data = request.get_json()
    ticker = data.get('ticker')

    if not ticker:
        return jsonify({'error': 'Ticker is required'}), 400

    # Fetch up-to-date data
    df = yf.download(ticker, period="150d", interval="1d")
    
    # Flatten multi-index columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Calculate moving averages
    df['MA_5'] = df['Close'].rolling(5).mean()
    df['MA_25'] = df['Close'].rolling(25).mean()
    df['MA_99'] = df['Close'].rolling(99).mean()

    # Shift data for signals
    df['Close_prev'] = df['Close'].shift(1)
    df['MA_5_prev'] = df['MA_5'].shift(1)
    df['MA_25_prev'] = df['MA_25'].shift(1)
    df['MA_99_prev'] = df['MA_99'].shift(1)

    # Define signals using DataFrame-wide boolean operations
    df['buy_signal'] = (df['Close_prev'] > df['MA_5_prev']) & (df['Close_prev'] > df['MA_25_prev'])
    df['sell_signal'] = df['Close_prev'] < df['MA_25_prev']
    
    # Golden cross signal
    df['ma_cross_signal'] = (
        (df['MA_25_prev'] > df['MA_99_prev']) & 
        (df['MA_25_prev'].shift(1) <= df['MA_99_prev'].shift(1))
    )

    # Calculate price drop percentage using a shifted rolling maximum for recent high
    df['recent_high'] = df['Close'].rolling(5).max()
    df['price_drop_percentage'] = (df['recent_high'].shift(1) - df['Close']) / df['recent_high'].shift(1)

    # Today's data (last row)
    today = df.iloc[-1]
    current_close = float(today['Close'])
    current_ma_25 = float(today['MA_25']) if not pd.isna(today['MA_25']) else None

    # Decision logic
    decision = "Hold"
    reason = "No strong signal detected."

    # Check buy signal
    if today['buy_signal']:
        decision = "Buy"
        reason = "Price above both 5-day and 25-day moving averages."

    # Check sell signal (if sell signal is true, it will override the buy signal)
    if today['sell_signal']:
        decision = "Exit"
        reason = "Price dropped below 25-day moving average."

    # Check golden cross signal (only if MA_25 is available)
    if today['ma_cross_signal'] and current_ma_25 is not None and current_close > current_ma_25:
        decision = "Buy More"
        reason = "Golden cross detected (25-day MA crossed above 99-day MA)."

    # Calculate recent high and price drop percentage from previous period (using the second-to-last row)
    if len(df) >= 2:
        recent_high_val = df['Close'].rolling(5).max().iloc[-2]
        price_drop_percentage = (recent_high_val - current_close) / recent_high_val if recent_high_val > 0 else 0

        # Check dip buying logic (only if MA_25 is available)
        if current_ma_25 is not None and (price_drop_percentage >= 0.05 and current_close > current_ma_25):
            decision = "Buy More"
            reason = "Price dropped by at least 5% from recent high but is still above 25-day moving average."

    response = {
        'ticker': ticker,
        'decision': decision,
        'reason': reason,
        'current_price': round(current_close, 2),
        'MA_5': round(float(today['MA_5']), 2) if not pd.isna(today['MA_5']) else None,
        'MA_25': round(float(today['MA_25']), 2) if not pd.isna(today['MA_25']) else None,
        'MA_99': round(float(today['MA_99']), 2) if not pd.isna(today['MA_99']) else None
    }

    return jsonify(response)

if __name__ == '__main__': 
    app.run(host='0.0.0.0', port=5000, debug=True)
