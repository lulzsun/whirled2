#!/bin/bash

if [ "$#" -lt 3 ]; then
    echo "Usage: $0 <sql_file> <placeholder1=value1> <placeholder2=value2> ..."
    exit 1
fi

sql_file="$1"
shift

modified_query=$(cat "$sql_file")

while [ "$#" -gt 0 ]; do
    placeholder="${1%%=*}"
    value="${1#*=}"
    modified_query=$(echo "$modified_query" | sed "s/{:$placeholder}/$value/g")
    shift
done

echo "$modified_query" | sqlite3 -column -header ./pb_data/data.db