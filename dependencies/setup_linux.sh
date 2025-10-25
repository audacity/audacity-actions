#!/bin/bash
# This script is used to set up a Linux environment for building and packaging software.
# It installs necessary packages and dependencies, and configures the environment.
# It is designed to be run in a Docker container or on a runner.

# Usage: ./setup_linux.sh [true|false]
# true: Force GCC 11
# false: Use the default GCC version
# Default is false
FORCE_GCC11="$1"

set -e
set -o pipefail

apt_packages=(
    # For self hosted runners
    wget
    curl
    build-essential
    file
    git
    # For Audacity
    libatk-bridge2.0-dev
    libcairo2-dev
    libcairo-gobject2
    libpango-1.0-0
    librsvg2-dev
    libjack-jackd2-dev
    libportaudio2
    libasound2-dev
    libgtk2.0-dev
    gettext
    libgl1-mesa-dev
    uuid-dev
    # For Qt building
    libx11-dev
    libx11-xcb-dev
    libfontenc-dev
    libice-dev
    libsm-dev
    libxau-dev
    libxaw7-dev
    libxcomposite-dev
    libxcursor-dev
    libxdamage-dev
    libxdmcp-dev
    libxext-dev
    libxfixes-dev
    libxi-dev
    libxinerama-dev
    libxkbfile-dev
    libxmu-dev
    libxmuu-dev
    libxpm-dev
    libxrandr-dev
    libxrender-dev
    libxres-dev
    libxss-dev
    libxt-dev
    libxtst-dev
    libxv-dev
    libxvmc-dev
    libxxf86vm-dev
    libxcb-render0-dev
    libxcb-render-util0-dev
    libxcb-xkb-dev
    libxcb-icccm4-dev
    libxcb-image0-dev
    libxcb-keysyms1-dev
    libxcb-randr0-dev
    libxcb-shape0-dev
    libxcb-sync-dev
    libxcb-xfixes0-dev
    libxcb-xinerama0-dev
    libxcb-dri3-dev
    libxcb-util0-dev
    libxcb-cursor-dev
    # xkeyboard-config
    xkb-data
    # It appears that CCI M4 package does not work correctly
    m4
    # To bundle Adwaita theme
    gnome-themes-extra
)

if [ "$(id -u)" -eq 0 ]; then
    echo "Running in docker container as root"
    apt update
    apt install --no-install-recommends -y sudo lsb-release
    # Disable interactive prompts
    export DEBIAN_FRONTEND=noninteractive
    ln -fs /usr/share/zoneinfo/UTC /etc/localtime
    echo "Etc/UTC" > /etc/timezone
fi

sudo apt update
sudo apt install -y --no-install-recommends "${apt_packages[@]}"
sudo apt remove -y ccache

# Force GCC11 if requested
if [[ "$FORCE_GCC11" == "true" ]]; then
    echo "Switch to GCC 11 on linux"
    sudo apt install --no-install-recommends -y gcc-11 g++-11
    sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-11 100 --slave /usr/bin/g++ g++ /usr/bin/g++-11 --slave /usr/bin/gcov gcov /usr/bin/gcov-11
    sudo update-alternatives --set gcc /usr/bin/gcc-11
fi

# Need to bump python3 to 3.10 for Ubuntu 20.04
source /etc/os-release
if [[ "$ID" == "ubuntu" && "$VERSION_ID" == "20.04" ]]; then
    sudo apt-get update -y
    sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg
    sudo update-ca-certificates
    curl -sSL https://github.com/astral-sh/python-build-standalone/releases/download/20251014/cpython-3.10.19+20251014-x86_64-unknown-linux-gnu-install_only.tar.gz \
    | sudo tar -xz -C /usr/local
    sudo ln -sf /usr/local/python/bin/python3.10 /usr/bin/python3
    sudo ln -sf /usr/local/python/bin/python3.10 /usr/bin/python
    export PATH="/usr/local/python/bin:$PATH"
    echo "/usr/local/python/bin" >> "$GITHUB_PATH"
    python3 -m ensurepip
    python3 -m pip install --upgrade pip
else
    sudo apt install -y --no-install-recommends python3 python3-pip
    sudo update-alternatives --install /usr/bin/python python /usr/bin/python3 1
fi

# allows to run git commands
git config --global --add safe.directory '*'
