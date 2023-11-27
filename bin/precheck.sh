#!/bin/bash

#
# helper script called by $ROOT/init.sh - check for required packages
#

command_exists() {
    type "$1" &> /dev/null 
}

version_gt() { 
    test "$(echo "$@" | tr " " "\n" | sort -V | head -n 1)" != "$1"; 
}

extract_version() {
    echo "$1" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n 1
}

# Commands and minimum versions
commands="node npm tsc esbuild jq aws cdk"
node_version="18.0.0"
npm_version="9.5.1"
tsc_version="3.8.0"
esbuild_version="0.19.0"
jq_version="1.5"
aws_version="2.10.2"
cdk_version="2.94.0"

status=0

for cmd in $commands; do
    min_version_var="${cmd}_version"
    min_version=${!min_version_var}
    if command_exists "$cmd"; then
        installed_version=$(extract_version "$($cmd --version)")
        if version_gt $min_version $installed_version; then
            echo "$cmd v$installed_version installed, v$min_version required - NOT OK"
            status=1
        else
            echo "$cmd v$installed_version installed - OK"
        fi        
    else
        echo "$cmd is NOT installed."
        status=1
    fi
done

exit $status

