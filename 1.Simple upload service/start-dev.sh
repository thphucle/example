#!/bin/bash
docker run -dit --rm --name=upload -v $(pwd):/usr/src -p 9888:80 node:8.16.0-alpine sh -c 