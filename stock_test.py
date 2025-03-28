import yfinance as yf
import pandas as pd
import numpy as np

# Download historical NVDA data
df = yf.download("NVDA", period="1y", interval="1d")

# Calculate moving averages
df['MA_5'] = df['Close'].rolling(5).mean()
df['MA_25'] = df['Close'].rolling(25).mean()
df['MA_99'] = df['Close'].rolling(99).mean()

# Shift data for signals
df['Close_prev'] = df['Close'].shift(1)
df['MA_5_prev'] = df['MA_5'].shift(1)
df['MA_25_prev'] = df['MA_25'].shift(1)
df['MA_99_prev'] = df['MA_99'].shift(1)

# Define signals
df['buy_signal'] = (df['Close_prev'] > df['MA_5_prev']) & (df['Close_prev'] > df['MA_25_prev'])
df['sell_signal'] = (df['Close_prev'] < df['MA_25_prev'])

# 25-day MA crosses above 99-day MA (golden cross)
df['ma_cross_signal'] = (
    (df['MA_25_prev'] > df['MA_99_prev']) &
    (df['MA_25_prev'].shift(1) <= df['MA_99_prev'].shift(1))
)

df.dropna(inplace=True)

# Initialize variables
initial_capital = 5000.0
capital = initial_capital
shares_held = 0
avg_purchase_price = 0.0

portfolio_history = []

# Simulate trading
for i in range(len(df)):
    current_close = float(df['Close'].iloc[i])
    current_MA25 = float(df['MA_25'].iloc[i])

    buy_signal = bool(df['buy_signal'].iloc[i])
    sell_signal = bool(df['sell_signal'].iloc[i])
    ma_cross_signal = bool(df['ma_cross_signal'].iloc[i])

    # SELL condition
    if shares_held > 0 and sell_signal:
        capital += shares_held * current_close
        shares_held = 0
        avg_purchase_price = 0.0

    # INITIAL BUY condition
    if shares_held == 0 and buy_signal and capital >= 1000:
        shares_to_buy = int(1000 // current_close)
        if shares_to_buy > 0:
            cost = shares_to_buy * current_close
            capital -= cost
            shares_held += shares_to_buy
            avg_purchase_price = current_close

    # ADDITIONAL BUY conditions (dip buy or golden cross)
    elif shares_held > 0 and capital >= 1000:
        price_drop_percentage = (avg_purchase_price - current_close) / avg_purchase_price
        bought_today = False  # Prevent buying twice on the same day

        # DIP BUYING (price drops ≥5% & still above 25 MA)
        if price_drop_percentage >= 0.05 and current_close > current_MA25:
            shares_to_buy = int(1000 // current_close)
            if shares_to_buy > 0:
                cost = shares_to_buy * current_close
                capital -= cost
                avg_purchase_price = ((avg_purchase_price * shares_held) + cost) / (shares_held + shares_to_buy)
                shares_held += shares_to_buy
                bought_today = True

        # GOLDEN CROSS (25 MA crosses above 99 MA)
        if ma_cross_signal and current_close > current_MA25 and not bought_today:
            shares_to_buy = int(1000 // current_close)
            if shares_to_buy > 0:
                cost = shares_to_buy * current_close
                capital -= cost
                avg_purchase_price = ((avg_purchase_price * shares_held) + cost) / (shares_held + shares_to_buy)
                shares_held += shares_to_buy

    # Track daily portfolio value
    portfolio_value = capital + shares_held * current_close
    portfolio_history.append(portfolio_value)

# Final results
final_portfolio_value = capital + shares_held * float(df['Close'].iloc[-1])
profit_loss = final_portfolio_value - initial_capital

print("----- Fully Integrated Strategy Results -----")
print(f"Initial Capital:   ${initial_capital:,.2f}")
print(f"Final Portfolio:   ${final_portfolio_value:,.2f}")
print(f"Net Profit/Loss:   ${profit_loss:,.2f}")
print(f"Return (%):        {profit_loss / initial_capital * 100:.2f}%")
