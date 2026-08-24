#!/usr/bin/env bash
set -euo pipefail

main() {
    ZOLA_VERSION=0.22.1
    ARCHIVE="zola-v${ZOLA_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
    # sha256 of the official linux-gnu tarball for v0.22.1
    EXPECTED_SHA256="0ca09aa40376aaa9ddfb512ff9ad963262ef95edb0d0f2d5ec6961b6f5cf22ef"

    curl -sfL "https://github.com/getzola/zola/releases/download/v${ZOLA_VERSION}/${ARCHIVE}" \
        -o "${ARCHIVE}"
    echo "${EXPECTED_SHA256}  ${ARCHIVE}" | sha256sum -c -

    tar -xzf "${ARCHIVE}"

    git submodule update --init --recursive

    ./zola build
}

main
