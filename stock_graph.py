import yfinance as yf
import matplotlib.pyplot as plt
import pandas as pd
import datetime

# Define the stock ticker symbol 
ticker_symbol = "AAPL"  # Apple Inc.

try:
    # Fetch historical data with explicit start and end dates
    # This approach is more reliable than using period="1y"
    end_date = datetime.datetime.now()
    start_date = end_date - datetime.timedelta(days=365)  # Last 365 days
    
    print(f"Fetching data for {ticker_symbol} from {start_date.date()} to {end_date.date()}")
    
    # Create a Ticker object
    stock = yf.Ticker(ticker_symbol)
    
    # Get historical data with explicit dates
    df = stock.history(start=start_date, end=end_date)
    
    # Check if we got any data
    if df.empty:
        print(f"No data found for {ticker_symbol}. Please check if the ticker symbol is correct.")
    else:
        print(f"Successfully retrieved {len(df)} days of data for {ticker_symbol}")
        
        # Calculate moving averages using the rolling window method
        df['MA_5'] = df['Close'].rolling(window=5).mean()
        df['MA_25'] = df['Close'].rolling(window=25).mean()
        df['MA_99'] = df['Close'].rolling(window=99).mean()
        
        # Create the plot
        plt.figure(figsize=(12, 6))
        plt.plot(df.index, df['Close'], label='Closing Price', color='blue')
        plt.plot(df.index, df['MA_5'], label='5-Day MA', color='red')
        plt.plot(df.index, df['MA_25'], label='25-Day MA', color='green')
        plt.plot(df.index, df['MA_99'], label='99-Day MA', color='orange')
        
        # Add title and labels
        plt.title(f"{ticker_symbol} Price and Moving Averages (Past Year)")
        plt.xlabel("Date")
        plt.ylabel("Price")
        plt.legend()
        plt.grid(True)
        
        # Display the plot
        plt.show()
        
except Exception as e:
    print(f"An error occurred: {e}")
    print("Try using a different ticker symbol or check your internet connection.")
