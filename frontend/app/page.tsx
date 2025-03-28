"use client"
import React, { useState, FormEvent } from 'react';

// Define a TypeScript interface for the API response.
interface AnalysisResult {
  ticker: string;
  decision: string;
  reason: string;
  current_price: number;
  MA_5: number | null;
  MA_25: number | null;
  MA_99: number | null;
}

export default function Home() {
  const [ticker, setTicker] = useState("");
  // Use the interface for "result" instead of "any".
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    try {
      // Replace with your server URL or IP if needed
      const response = await fetch("http://127.0.0.1:5000/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      // Remove the unused error variable to satisfy ESLint
      setError("Failed to fetch data from the server.");
    }
  };

  // The function to determine text color.
  const getColor = (decision: string) => {
    switch (decision) {
      case "Buy":
        return "text-green-500";
      case "Buy More":
        return "text-blue-500";
      case "Exit":
        return "text-red-500";
      case "Golden Cross":
        return "text-yellow-600";
      default:
        return "text-black";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-2xl mb-4">Enter Stock Ticker</h1>
      <form onSubmit={handleSubmit} className="flex flex-col items-center">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Enter ticker..."
          className="border border-gray-300 rounded p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white rounded py-2 px-4 hover:bg-blue-600"
        >
          Submit
        </button>
      </form>

      {error && <div className="text-red-500 mt-4">{error}</div>}

      {result && (
        <div className="mt-6 p-4 border border-gray-300 rounded bg-white">
          <h2 className="text-xl mb-2">Stock Analysis Result</h2>
          <div>Ticker: {result.ticker}</div>
          <div className={`${getColor(result.decision)} font-bold`}>
            Decision: {result.decision}
          </div>
          <div>Reason: {result.reason}</div>
          <div>Current Price: ${result.current_price}</div>
          <div>MA_5: {result.MA_5 ?? "N/A"}</div>
          <div>MA_25: {result.MA_25 ?? "N/A"}</div>
          <div>MA_99: {result.MA_99 ?? "N/A"}</div>
        </div>
      )}
    </div>
  );
}
