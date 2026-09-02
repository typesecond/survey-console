#!/bin/bash

#
# Create a new user
# Invoke with 'username' 'password' 'fullname'
#
if (( $# != 4 )) then
  echo  "Usage: " $0 username password fullname email
  exit
fi

source $(dirname $0)/.env

echo creating user $1 $3
curl -4 -q --header "Content-Type: application/json" \
    -d "{\"username\":\"$1\",\"password\":\"$2\",\"fullname\":\"$3\",\"email\":\"$4\"}" \
    -i -X POST ${API}/user

