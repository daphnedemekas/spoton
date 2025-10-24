# SpotOn - Event Discovery App

SpotOn is a Tinder-style event discovery app that helps users find local events tailored to their interests. Swipe right to save events, swipe left to pass.

## Features

- 🎯 Tinder-style swipe interface for discovering events
- 🔍 AI-powered event discovery using OpenAI and Brave Search
- 📅 Automatic event scraping with JSON-LD extraction
- 🏙️ Location-based event filtering
- 💾 Save events and track attendance
- 👥 Connect with friends going to the same events
- 🎨 Beautiful, modern UI with Tailwind CSS and shadcn/ui

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js (via Vite middleware)
- **Database**: SQLite (local development) / Supabase (production)
- **APIs**: OpenAI GPT-4o-mini, Brave Search API
- **Scraping**: Cheerio for HTML parsing

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Brave Search API key (optional, default key included)

### Installation

```sh
# Clone the repository
git clone https://github.com/daphnedemekas/spoton.git

# Navigate to the project directory
cd spoton

# Install dependencies
npm install --legacy-peer-deps

# Create .env file with your API keys
echo "OPENAI_API_KEY=your_openai_key_here" > .env
echo "OPENAI_MODEL=gpt-4o-mini" >> .env

# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`

### Environment Variables

Create a `.env` file in the root directory with:

```
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
BRAVE_API_KEY=your_brave_api_key (optional)
```

## Development Tools

### Discovery Pipeline Testing

Test and optimize the event discovery pipeline without running the full app:

```sh
# Run with default settings
npm run discover

# Run with custom settings
npm run discover -- --city "San Francisco" --interests "music,tech,food" --limit 50

# Options:
#   --city "City Name"           Target city (default: San Francisco)
#   --interests "cat1,cat2"      Comma-separated interests
#   --vibes "vibe1,vibe2"        Comma-separated vibes
#   --limit N                    Max events to discover (default: 50)
#   --sitesLimit N               Max sites to scrape (default: 15)
#   --resultsPerQuery N          Results per search query (default: 7)
#   --interestsLimit N           Max interests to search (default: 4)
#   --timeoutMs N                Timeout in ms (default: 120000)
#   --skipRanking true/false     Skip LLM ranking (default: false)
```

Results and logs are saved to the `logs/` directory.

### Viewing Logs

```sh
# View all discovery logs
./view-logs.sh

# Or directly
tail -f logs/discovery.log
```

## How It Works

### Event Discovery Pipeline

1. **Brave Search**: Searches for event listing websites based on user's city and interests
2. **Site Scraping**: Extracts event links from listing pages using smart URL pattern matching
3. **Event Extraction**: 
   - First tries to extract structured data via JSON-LD
   - Falls back to LLM-based validation for candidate pages
4. **Smart Filtering**:
   - Deduplicates events
   - Filters by location (city or online only)
   - Validates dates and required fields
5. **LLM Ranking** (optional):
   - When < 100 events found, uses GPT-4o-mini to rank and enhance descriptions
   - When 100+ events found, skips LLM for efficiency
6. **Caching**: Results cached for 10 minutes to reduce API costs

### Optimized Configuration

The pipeline is optimized for:
- **Maximum event discovery**: 50+ events per run
- **Speed**: Completes in 30-60 seconds
- **Quality**: Prioritizes structured data (JSON-LD) over LLM extraction
- **Cost**: Skips expensive LLM calls when sufficient structured data exists

## Project Structure

```
spoton/
├── src/
│   ├── pages/           # React pages (Discover, Profile, etc.)
│   ├── components/      # Reusable React components
│   ├── integrations/    # Supabase/database integration
│   └── lib/             # Utilities and helpers
├── scripts/
│   └── test-discovery.ts  # Standalone discovery testing script
├── logs/                # Discovery logs and results
├── vite.config.ts       # Vite config with discovery API middleware
└── package.json
```

## Contributing

This is a personal project, but feedback and suggestions are welcome!

## License

MIT

## Acknowledgments

- Built with [Lovable](https://lovable.dev)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Event data sourced from various public event listing sites
