#!/bin/bash

# Exit if HEROKU_API_TOKEN or HEROKU_APP_NAME is not set
[ -z "$HEROKU_API_TOKEN" ] && echo "Error: HEROKU_API_TOKEN required" && exit 1
[ -z "$HEROKU_APP_NAME" ] && echo "Error: HEROKU_APP_NAME required" && exit 1

# Restart web dyno using curl
curl -X DELETE \
  -H "Authorization: Bearer ${HEROKU_API_TOKEN}" \
  -H "Accept: application/vnd.heroku+json; version=3" \
  "https://api.heroku.com/apps/${HEROKU_APP_NAME}/dynos/web"