"use client";
import React, { useState, FormEvent, useEffect } from "react";

// Updated interface including additional indicators and optional OBV history
interface AnalysisResult {
  ticker: string;
  decision: string;
  reason: string;
  current_price: number;
  MA_5: number | null;
  MA_25: number | null;
  MA_99: number | null;
  indicators?: {
    RSI?: number;
    MACD?: {
      macd: number;
      signal: number;
    };
    BollingerBands?: {
      upper: number;
      lower: number;
    };
    OBV_change?: number;
    OBV_history?: number[];
    Fibonacci_levels?: { [key: string]: number };
  };
}

/* ================================
   TINY GRAPH COMPONENTS
================================ */

// 1. PriceChart: Display current price, MA5, MA25, MA99 as dots along a horizontal line (no text).
interface PriceChartProps {
  currentPrice: number;
  MA5: number | null;
  MA25: number | null;
  MA99: number | null;
}
const PriceChart: React.FC<PriceChartProps> = ({ currentPrice, MA5, MA25, MA99 }) => {
  const values = [currentPrice, MA5, MA25, MA99].filter((v): v is number => v !== null);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const width = 300;
  const height = 50;
  const scaleX = (val: number) => ((val - minVal) / range) * (width - 40) + 20;

  return (
    <svg width={width} height={height} className="mx-auto my-2">
      {/* Horizontal axis */}
      <line x1={20} y1={height / 2} x2={width - 20} y2={height / 2} stroke="#aaa" strokeWidth={2} />
      {/* All markers on the same y-axis */}
      <circle cx={scaleX(currentPrice)} cy={height / 2} r={4} fill="black" />
      {MA5 !== null && <circle cx={scaleX(MA5)} cy={height / 2} r={4} fill="blue" />}
      {MA25 !== null && <circle cx={scaleX(MA25)} cy={height / 2} r={4} fill="orange" />}
      {MA99 !== null && <circle cx={scaleX(MA99)} cy={height / 2} r={4} fill="red" />}
    </svg>
  );
};

// 2. RSIBar: Horizontal bar from 0 to 100 with a marker (no internal text).
interface RSIBarProps {
  rsi: number;
}
const RSIBar: React.FC<RSIBarProps> = ({ rsi }) => {
  const width = 200;
  const height = 20;
  let markerColor = "grey";
  if (rsi >= 70) markerColor = "red";
  else if (rsi <= 30) markerColor = "green";

  return (
    <svg width={width} height={height} className="mx-auto my-2">
      <rect x={0} y={height / 4} width={width} height={height / 2} fill="#eee" />
      <circle cx={(rsi / 100) * width} cy={height / 2} r={6} fill={markerColor} />
      {/* Only left and right labels */}
      <text x={0} y={height - 2} fontSize="10" fill="#555">
        0
      </text>
      <text x={width} y={height - 2} fontSize="10" fill="#555" textAnchor="end">
        100
      </text>
    </svg>
  );
};

// 3. MACDIndicator: Show whether a bullish or bearish crossover is present.
interface MACDIndicatorProps {
  macd: number;
  signal: number;
}
const MACDIndicator: React.FC<MACDIndicatorProps> = ({ macd, signal }) => {
  const isBullish = macd > signal;
  return (
    <div className="flex items-center justify-center my-2">
      <svg width={50} height={30}>
        <line x1={5} y1={15} x2={45} y2={15} stroke="#ccc" strokeWidth={2} />
        <circle cx={isBullish ? 35 : 15} cy={15} r={4} fill={isBullish ? "green" : "red"} />
        <circle cx={isBullish ? 15 : 35} cy={15} r={4} fill="#888" />
      </svg>
      <span className="ml-2 text-sm">
        {isBullish ? "Bullish Crossover" : "Bearish Crossover"}
      </span>
      <span className="ml-2 text-xs">
        (MACD: {macd.toFixed(2)} / Signal: {signal.toFixed(2)})
      </span>
    </div>
  );
};

// 4. BollingerBar: Horizontal bar showing the lower and upper bands with left/right labels.
interface BollingerBarProps {
  currentPrice: number;
  upper: number;
  lower: number;
}
const BollingerBar: React.FC<BollingerBarProps> = ({ currentPrice, upper, lower }) => {
  const width = 200;
  const height = 20;
  const minVal = lower;
  const maxVal = upper;
  const range = maxVal - minVal || 1;
  const scaleX = (val: number) => ((val - minVal) / range) * (width - 20) + 10;
  return (
    <svg width={width} height={height} className="mx-auto my-2">
      <rect x={10} y={height / 3} width={width - 20} height={height / 3} fill="#eee" />
      <line x1={10} y1={0} x2={10} y2={height} stroke="#aaa" strokeWidth={1} />
      <line x1={width - 10} y1={0} x2={width - 10} y2={height} stroke="#aaa" strokeWidth={1} />
      <circle cx={scaleX(currentPrice)} cy={height / 2} r={4} fill="black" />
      {/* Left label for lower and right label for upper */}
      <text x={10} y={height - 2} fontSize="10" fill="#555" textAnchor="start">
        {lower.toFixed(2)}
      </text>
      <text x={width - 10} y={height - 2} fontSize="10" fill="#555" textAnchor="end">
        {upper.toFixed(2)}
      </text>
    </svg>
  );
};

// 6. FibonacciLevelsChart: Display the 5 Fibonacci levels horizontally and highlight the one closest to currentPrice.
interface FibonacciLevelsChartProps {
  levels: { [key: string]: number };
  currentPrice: number;
}
const FibonacciLevelsChart: React.FC<FibonacciLevelsChartProps> = ({ levels, currentPrice }) => {
  const levelArr = Object.entries(levels).sort((a, b) => b[1] - a[1]);
  let closestLabel = "";
  let smallestDiff = Infinity;
  levelArr.forEach(([label, value]) => {
    const diff = Math.abs(value - currentPrice);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestLabel = label;
    }
  });

  return (
    <div className="flex justify-center items-center my-2 space-x-2">
      {levelArr.map(([label, value]) => (
        <div
          key={label}
          className={`p-1 text-xs border rounded ${
            label === closestLabel ? "bg-yellow-300" : "bg-gray-200"
          }`}
        >
          {label}: {value.toFixed(2)}
        </div>
      ))}
    </div>
  );
};

/* ================================
   MAIN COMPONENT
================================ */
export default function Home() {
  const [username, setUsername] = useState("");
  const [showUsernameModal, setShowUsernameModal] = useState(true);
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userTickers, setUserTickers] = useState<string[]>([]);
  const [savedTickersAnalysis, setSavedTickersAnalysis] = useState<AnalysisResult[]>([]);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tickerToDelete, setTickerToDelete] = useState("");

  const fetchUserTickers = async () => {
    if (!username) return;
    try {
      const response = await fetch(`http://15.156.193.147:5000/tickers/${username}`);
      if (response.ok) {
        const data = await response.json();
        setUserTickers(data.tickers || []);
      } else {
        setUserTickers([]);
      }
    } catch (err) {
      console.error(err);
      setUserTickers([]);
    }
  };

  const fetchAllSavedTickersAnalysis = async (tickers: string[]) => {
    setIsAnalysisLoading(true);
    try {
      const results: AnalysisResult[] = [];
      for (const tkr of tickers) {
        const response = await fetch("http://15.156.193.147:5000/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: tkr }),
        });
        const data = await response.json();
        if (response.ok) {
          results.push(data as AnalysisResult);
        } else {
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
      }
      setSavedTickersAnalysis(results);
    } catch (err) {
      console.error("Failed to fetch analysis for saved tickers:", err);
      setSavedTickersAnalysis([]);
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const handleUsernameSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username) return;
    setShowUsernameModal(false);
    await fetchUserTickers();
  };

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
        setShowAnalysisModal(true);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Failed to fetch data from the server.");
    }
  };

  const handleAddTicker = async () => {
    if (!result) return;
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
        await fetchUserTickers();
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

  useEffect(() => {
    if (userTickers.length > 0) {
      fetchAllSavedTickersAnalysis(userTickers);
    } else {
      setSavedTickersAnalysis([]);
    }
  }, [userTickers]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
      {/* Username Modal */}
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
              <button type="submit" className="bg-blue-500 text-white rounded py-2 px-4 hover:bg-blue-600">
                Confirm
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!showUsernameModal && (
        <>
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
            <button type="submit" className="bg-blue-500 text-white rounded py-2 px-4 hover:bg-blue-600">
              Analyze
            </button>
          </form>
          {error && <div className="text-red-500 mt-4">{error}</div>}
          {/* Saved Tickers Display */}
          <div className="w-full max-w-md mb-6">
            <h2 className="text-lg font-bold mb-4">Your Saved Tickers</h2>
            {isAnalysisLoading ? (
              <div className="bg-white p-4 rounded shadow flex flex-col items-center space-y-2">
                <div>Loading Tickers...</div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: "50%" }} />
                </div>
              </div>
            ) : savedTickersAnalysis.length === 0 ? (
              <div className="bg-white p-4 rounded shadow">
                <div>No tickers saved yet.</div>
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {savedTickersAnalysis.map((analysis) => (
                  <div key={analysis.ticker} className="bg-white p-4 rounded shadow text-left">
                    <h3 className="text-lg font-semibold">Ticker: {analysis.ticker}</h3>
                    <div className={`font-bold ${getColor(analysis.decision)}`}>
                      Decision: {analysis.decision}
                    </div>
                    <div>Reason: {analysis.reason}</div>
                    {/* MA Legend */}
                    <div className="text-xs text-center my-1">
                      <span className="text-black">Current: {analysis.current_price.toFixed(2)}</span> |{" "}
                      {analysis.MA_5 !== null && (
                        <span className="text-blue-500">MA5: {analysis.MA_5.toFixed(2)}</span>
                      )}{" "}
                      | {analysis.MA_25 !== null && (
                        <span className="text-orange-500">MA25: {analysis.MA_25.toFixed(2)}</span>
                      )}{" "}
                      | {analysis.MA_99 !== null && (
                        <span className="text-red-500">MA99: {analysis.MA_99.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="my-2">
                      <PriceChart
                        currentPrice={analysis.current_price}
                        MA5={analysis.MA_5}
                        MA25={analysis.MA_25}
                        MA99={analysis.MA_99}
                      />
                    </div>
                    {analysis.indicators && (
                      <div className="mt-2 space-y-2">
                        {analysis.indicators.RSI !== undefined && (
                          <div className="text-sm">
                            <strong>RSI:</strong> {analysis.indicators.RSI.toFixed(1)}
                            <RSIBar rsi={analysis.indicators.RSI} />
                          </div>
                        )}
                        {analysis.indicators.MACD && (
                          <div>
                            <div className="text-sm font-medium">MACD</div>
                            <MACDIndicator
                              macd={analysis.indicators.MACD.macd}
                              signal={analysis.indicators.MACD.signal}
                            />
                          </div>
                        )}
                        {analysis.indicators.BollingerBands && (
                          <div className="text-sm">
                            <strong>Bollinger Bands:</strong> Upper:{" "}
                            {analysis.indicators.BollingerBands.upper.toFixed(2)}, Lower:{" "}
                            {analysis.indicators.BollingerBands.lower.toFixed(2)}
                            <BollingerBar
                              currentPrice={analysis.current_price}
                              upper={analysis.indicators.BollingerBands.upper}
                              lower={analysis.indicators.BollingerBands.lower}
                            />
                          </div>
                        )}
                        {analysis.indicators.OBV_change !== undefined && (
                          <div className="text-sm text-center">
                            OBV Change: {analysis.indicators.OBV_change.toFixed(0)}
                          </div>
                        )}
                        {analysis.indicators.Fibonacci_levels && (
                          <div>
                            <div className="text-sm font-medium">Fibonacci Levels</div>
                            <FibonacciLevelsChart
                              levels={analysis.indicators.Fibonacci_levels}
                              currentPrice={analysis.current_price}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowDeleteModal(true)} className="mt-4 bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600">
              Delete Ticker
            </button>
          </div>
        </>
      )}

      {/* Analysis Modal */}
      {showAnalysisModal && result && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded shadow max-w-md">
            <h2 className="text-xl mb-2">Stock Analysis Result</h2>
            <div className="mb-2">Ticker: {result.ticker}</div>
            <div className={`mb-2 font-bold ${getColor(result.decision)}`}>
              Decision: {result.decision}
            </div>
            <div className="mb-2">Reason: {result.reason}</div>
            <div className="text-xs text-center my-1">
              <span className="text-black">Current: {result.current_price.toFixed(2)}</span> |{" "}
              {result.MA_5 !== null && (
                <span className="text-blue-500">MA5: {result.MA_5.toFixed(2)}</span>
              )}{" "}
              | {result.MA_25 !== null && (
                <span className="text-orange-500">MA25: {result.MA_25.toFixed(2)}</span>
              )}{" "}
              | {result.MA_99 !== null && (
                <span className="text-red-500">MA99: {result.MA_99.toFixed(2)}</span>
              )}
            </div>
            <div className="my-2">
              <PriceChart
                currentPrice={result.current_price}
                MA5={result.MA_5}
                MA25={result.MA_25}
                MA99={result.MA_99}
              />
            </div>
            {result.indicators && (
              <div className="mb-4 space-y-2">
                {result.indicators.RSI !== undefined && (
                  <div className="text-sm">
                    <strong>RSI:</strong> {result.indicators.RSI.toFixed(1)}
                    <RSIBar rsi={result.indicators.RSI} />
                  </div>
                )}
                {result.indicators.MACD && (
                  <div>
                    <div className="text-sm font-medium">MACD</div>
                    <MACDIndicator
                      macd={result.indicators.MACD.macd}
                      signal={result.indicators.MACD.signal}
                    />
                  </div>
                )}
                {result.indicators.BollingerBands && (
                  <div className="text-sm">
                    <strong>Bollinger Bands:</strong> Upper: {result.indicators.BollingerBands.upper.toFixed(2)}, Lower: {result.indicators.BollingerBands.lower.toFixed(2)}
                    <BollingerBar
                      currentPrice={result.current_price}
                      upper={result.indicators.BollingerBands.upper}
                      lower={result.indicators.BollingerBands.lower}
                    />
                  </div>
                )}
                {result.indicators.OBV_change !== undefined && (
                  <div className="text-sm text-center">
                    OBV Change: {result.indicators.OBV_change.toFixed(0)}
                  </div>
                )}
                {result.indicators.Fibonacci_levels && (
                  <div>
                    <div className="text-sm font-medium">Fibonacci Levels</div>
                    <FibonacciLevelsChart
                      levels={result.indicators.Fibonacci_levels}
                      currentPrice={result.current_price}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col items-center space-y-2">
              <button onClick={handleAddTicker} className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 w-32">
                Add Ticker
              </button>
              <button onClick={() => { setShowAnalysisModal(false); setResult(null); }} className="bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400 w-32">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ticker Modal */}
      {showDeleteModal && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center z-10">
          <div className="bg-white p-6 rounded shadow max-w-sm w-full">
            <h2 className="text-xl mb-2">Delete a Ticker</h2>
            <form onSubmit={handleDeleteTicker} className="flex flex-col items-center">
              <select className="border border-gray-300 rounded p-2 mb-4" value={tickerToDelete} onChange={(e) => setTickerToDelete(e.target.value)}>
                <option value="">Select Ticker</option>
                {userTickers.map((tkr) => (
                  <option key={tkr} value={tkr}>
                    {tkr}
                  </option>
                ))}
              </select>
              <div className="flex space-x-4">
                <button type="submit" className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600">
                  Delete
                </button>
                <button type="button" onClick={() => setShowDeleteModal(false)} className="bg-gray-300 text-black py-2 px-4 rounded hover:bg-gray-400">
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
