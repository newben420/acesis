# Acesis 🎾

Acesis is a sophisticated sports prediction and analysis engine designed to identify potential winners in tennis matches. It combines real-time data scraping from SofaScore, analytical probability modeling, and AI-driven verdicts to provide high-precision insights for betting and performance tracking.

## ✨ Features

-   **Tennis-Specific Analytics**: Processes advanced metrics including ATP/WTA rankings, surface performance, serve win rates, and break point conversion.
-   **AI-Powered Verdicts**: Integrates with Groq LLM to generate deep-dive technical evaluations and confidence scores for match winners.
-   **Strict Booking Mode**: Intelligent booking logic that cross-references analytical favorites with AI verdicts for safer selections.
-   **Real-time Data Fetching**: Automated scraping of upcoming tennis fixtures and live event results.
-   **Dynamic Dashboard**: A premium monitoring interface showing win probabilities, "Match Edge" confidence, and extended player statistics.
-   **Automated Results Tracking**: Integrated engine for monitoring match completions (including retirements and walkovers) via SportyBet share codes.

## 🏗 Architecture

The project is built with Node.js and TypeScript, following a modular architecture:

-   `src/index.ts`: Entry point for the Express server and core engine initialization.
-   `src/engine/`:
    -   `events_processor.ts`: Manages the fixture lifecycle and database persistence (SQLite).
    -   `sofascore.ts`: Handles deterministic scraping and player metadata extraction.
    -   `booker.ts`: Implements sophisticated tennis booking logic with "Strict Mode" support.
    -   `result.ts`: Automated winner verification engine for trackable betting codes.
    -   `prompt.ts`: Specialized prompt engineering for tennis-specific AI analysis.
-   `src/lib/`: Analytical utilities including probability compute functions and date-time management.
-   `views/`: Frontend SPA (Single Page Application) for visual analysis and booking management.

## 🚀 Getting Started

### Prerequisites

-   Node.js (v18+)
-   SQLite3
-   npm or yarn

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Configuration

1.  Copy the environment template:
    ```bash
    cp .env.example .env
    ```
2.  Configure your credentials in `.env`. Key variables include `GROQ_KEY` for AI features and `PORT` for the dashboard.
3.  See [.env.example](file:///home/wraith/Desktop/PREDA/acesis/.env.example) for detailed documentation on each variable.

### Running the Application

-   **Development**: `npm run dev`
-   **Production**: `npm run build && npm start`

## 📊 Dashboard

The dashboard is accessible by default at `http://127.0.0.1:4000`. Use the "Book Winners" modal to generate share codes based on your desired "Match Edge" (confidence score) and toggle **Strict Mode** for LLM-verified picks.

## 🛠 Tech Stack

-   **Backend**: Node.js, Express, TypeScript, SQLite
-   **Intelligence**: Groq AI (Llama-3 models)
-   **Data**: Axios, Cheerio, String-Similarity
-   **UI**: HTML5, Vanilla CSS, Bootstrap 5, jQuery

## 📝 License

This project is licensed under the ISC License.
