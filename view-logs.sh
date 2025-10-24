#!/bin/bash
# View discovery logs with timestamps
echo "=== DISCOVERY LOGS ==="
if [ -f "logs/discovery.log" ]; then
  tail -n 50 logs/discovery.log
else
  echo "No logs found. Run discovery first."
fi
