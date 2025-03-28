"use client";
import React, { useState, FormEvent, useEffect } from "react";

// Define a TypeScript interface for the API response from /status
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
  // -------------------------------
  // 1) STATE DECLARATIONS
  // -------------------------------
  const [username, setUsername] = useState("");
  const [showUsernameModal, setShowUsernameModal] = useState(true);

  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manage the user's saved tickers (names only)
  const [userTickers, setUserTickers] = useState<string[]>([]);

  // Detailed analysis for each saved ticker, displayed as cards
  const [savedTickersAnalysis, setSavedTickersAnalysis] = useState<AnalysisResult[]>([]);

  // Track if we’re in the process of fetching ticker analysis
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  // For controlling modals
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // For the selected ticker to delete
  const [tickerToDelete, setTickerToDelete] = useState("");

  // -------------------------------
  // 2) HELPER FUNCTIONS
  // -------------------------------
  // Fetch user tickers from your server
  const fetchUserTickers = async () => {
    if (!username) return;
    try {
      const response = await fetch(`http://15.156.193.147:5000/tickers/${username}`);
      if (response.ok) {
        const data = await response.json();
        setUserTickers(data.tickers || []);
      } else {
        // If the user doesn't exist or there's an error, you might clear the array
        setUserTickers([]);
      }
    } catch (err) {
      console.error(err);
      setUserTickers([]);
    }
  };

  /**
   * Fetch the /status analysis for each ticker in "userTickers"
   * and store them in "savedTickersAnalysis", sequentially.
   */
  const fetchAllSavedTickersAnalysis = async (tickers: string[]) => {
    setIsAnalysisLoading(true); // Start loading
    try {
      const results: AnalysisResult[] = [];

      for (const tkr of tickers) {
        console.log(`Fetching analysis for ticker: ${tkr}`);
        const response = await fetch("http://15.156.193.147:5000/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: tkr }),
        });

        const data = await response.json();
        console.log(`Response for ${tkr}:`, data);

        if (response.ok) {
          // data should conform to AnalysisResult
          results.push(data as AnalysisResult);
        } else {
          // If something went wrong, store an error-like response
          results.push({
            ticker: tkr,
            decision: "Error",
            reason: data.error || "Failed to fetch analysis",
            current_price: 0,
            MA_5: null,
            MA_25: null,
            MA_99: null,
          });
        }

        // (Optional) small delay between requests if you suspect rate limits:
        // await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log("All results:", results);
      setSavedTickersAnalysis(results);
    } catch (err) {
      console.error("Failed to fetch analysis for saved tickers:", err);
      setSavedTickersAnalysis([]);
    } finally {
      setIsAnalysisLoading(false); // Stop loading
    }
  };

  // -------------------------------
  // 3) EVENT HANDLERS
  // -------------------------------
  // A) Once user enters their username
  const handleUsernameSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username) return;

    // Hide the username modal
    setShowUsernameModal(false);
    // Fetch the user's saved tickers
    await fetchUserTickers();
  };

  // B) Searching for a ticker -> get analysis from /status
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    try {
      const response = await fetch("http://15.156.193.147:5000/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
        // Show analysis pop-up for the newly searched ticker
        setShowAnalysisModal(true);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Failed to fetch data from the server.");
    }
  };

  // C) Add ticker to user's list
  const handleAddTicker = async () => {
    if (!result) return; // No result to add
    try {
      const response = await fetch("http://15.156.193.147:5000/add_ticker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          ticker: result.ticker,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        // Successfully added; refresh user's tickers
        await fetchUserTickers();
        // Close analysis modal
        setShowAnalysisModal(false);
        setResult(null);
      } else {
        alert(data.error || "Error adding ticker.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to add ticker.");
    }
  };

  // D) Deleting a ticker
  const handleDeleteTicker = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tickerToDelete) return;
    try {
      const response = await fetch("http://15.156.193.147:5000/delete_ticker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          ticker: tickerToDelete,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // Refresh user's tickers
        await fetchUserTickers();
        setTickerToDelete("");
        setShowDeleteModal(false);
      } else {
        alert(data.message || "Error deleting ticker.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete ticker.");
    }
  };

  // -------------------------------
  // 4) HELPER FOR DECISION COLOR
  // -------------------------------
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
      case "Error":
        return "text-red-600";
      default:
        return "text-black";
    }
  };

  // -------------------------------
  // 5) EFFECTS
  // -------------------------------
  /**
   * Whenever userTickers changes (after we fetch them),
   * load the analysis details for each saved ticker.
   */
  useEffect(() => {
    if (userTickers.length > 0) {
      fetchAllSavedTickersAnalysis(userTickers);
    } else {
      // If no tickers, clear out any old data
      setSavedTickersAnalysis([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTickers]);

  // -------------------------------
  // 6) RENDER
  // -------------------------------
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
      {/* USERNAME MODAL */}
      {showUsernameModal && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-xl mb-4">Enter Your Username</h2>
            <form onSubmit={handleUsernameSubmit} className="flex flex-col space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="border border-gray-300 rounded p-2"
              />
              <button
                type="submit"
                className="bg-blue-500 text-white rounded py-2 px-4 hover:bg-blue-600"
              >
                Confirm
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MAIN CONTENT - ONLY VISIBLE AFTER USERNAME IS ENTERED */}
      {!showUsernameModal && (
        <>
          {/* Title */}
          <h1 className="text-2xl mb-4">Welcome, {username}</h1>

          {/* Ticker Search Form */}
          <form onSubmit={handleSubmit} className="flex flex-col items-center mb-6">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Search for a ticker..."
              className="border border-gray-300 rounded p-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-500 text-white rounded py-2 px-4 hover:bg-blue-600"
            >
              Analyze
            </button>
          </form>

          {/* Error Message */}
          {error && <div className="text-red-500 mt-4">{error}</div>}

          {/* User Tickers Display (Cards) */}
          <div className="w-full max-w-md mb-6">
            <h2 className="text-lg font-bold mb-4">Your Saved Tickers</h2>

            {/** If we are currently loading, show a "Loading Tickers" message + bar */}
            {isAnalysisLoading ? (
              <div className="bg-white p-4 rounded shadow flex flex-col items-center space-y-2">
                <div>Loading Tickers...</div>
                {/* A simple "progress bar" using Tailwind */}
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full animate-pulse"
                    style={{ width: "50%" }}
                  />
                </div>
              </div>
            ) : savedTickersAnalysis.length === 0 ? (
              <div className="bg-white p-4 rounded shadow">
                <div>No tickers saved yet.</div>
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {savedTickersAnalysis.map((analysis) => (
                  <div
                    key={analysis.ticker}
                    className="bg-white p-4 rounded shadow text-left"
                  >
                    <h3 className="text-lg font-semibold">
                      Ticker: {analysis.ticker}
                    </h3>
                    <div className={`font-bold ${getColor(analysis.decision)}`}>
                      Decision: {analysis.decision}
                    </div>
                    <div>Reason: {analysis.reason}</div>
                    <div>Current Price: ${analysis.current_price}</div>
                    <div>MA_5: {analysis.MA_5 ?? "N/A"}</div>
                    <div>MA_25: {analysis.MA_25 ?? "N/A"}</div>
                    <div>MA_99: {analysis.MA_99 ?? "N/A"}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Delete Ticker Button */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="mt-4 bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
            >
              Delete Ticker
            </button>
          </div>
        </>
      )}

      {/* ANALYSIS MODAL (for newly searched ticker) */}
      {showAnalysisModal && result && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded shadow max-w-md">
            <h2 className="text-xl mb-2">Stock Analysis Result</h2>
            <div className="mb-2">Ticker: {result.ticker}</div>
            <div className={`mb-2 font-bold ${getColor(result.decision)}`}>
              Decision: {result.decision}
            </div>
            <div className="mb-2">Reason: {result.reason}</div>
            <div className="mb-2">Current Price: ${result.current_price}</div>
            <div className="mb-2">MA_5: {result.MA_5 ?? "N/A"}</div>
            <div className="mb-2">MA_25: {result.MA_25 ?? "N/A"}</div>
            <div className="mb-4">MA_99: {result.MA_99 ?? "N/A"}</div>

            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={handleAddTicker}
                className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 w-32"
              >
                Add Ticker
              </button>
              <button
                onClick={() => {
                  setShowAnalysisModal(false);
                  setResult(null);
                }}
                className="bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400 w-32"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE TICKER MODAL */}
      {showDeleteModal && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded shadow max-w-sm w-full">
            <h2 className="text-xl mb-2">Delete a Ticker</h2>
            <form onSubmit={handleDeleteTicker} className="flex flex-col items-center">
              <select
                className="border border-gray-300 rounded p-2 mb-4"
                value={tickerToDelete}
                onChange={(e) => setTickerToDelete(e.target.value)}
              >
                <option value="">Select Ticker</option>
                {userTickers.map((tkr) => (
                  <option key={tkr} value={tkr}>
                    {tkr}
                  </option>
                ))}
              </select>
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
