FROM debian:bookworm-slim

ARG HERCULES_REF=410b9738c049ab1825d67b36b072d837c1d0b33a
ARG PACKETVER=20141022

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/opt/conan/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        gettext-base \
        git \
        libmariadb-dev \
        libpcre2-dev \
        libssl-dev \
        mariadb-client \
        pkg-config \
        python3 \
        python3-pip \
        python3-venv \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/conan \
    && /opt/conan/bin/pip install --no-cache-dir "conan>=2,<3" \
    && /opt/conan/bin/conan profile detect --force

WORKDIR /opt/hercules
RUN git clone https://github.com/HerculesWS/Hercules.git . \
    && git checkout "${HERCULES_REF}" \
    && rm -rf .git \
    && cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/opt/hercules \
        -DCMAKE_PROJECT_TOP_LEVEL_INCLUDES=/opt/hercules/cmake_modules/conan_provider.cmake \
        -DPACKETVER="${PACKETVER}" \
        -DENABLE_TESTING=OFF \
        -DENABLE_RENEWAL=OFF \
        -DOBFUSCATIONKEY1= \
        -DOBFUSCATIONKEY2= \
        -DOBFUSCATIONKEY3= \
    && cmake --build build --parallel 2 \
    && cmake --install build

COPY config/ /opt/hercules/docker-config/
COPY entrypoint.sh /usr/local/bin/hercules-entrypoint

RUN useradd --system --home-dir /opt/hercules --shell /usr/sbin/nologin hercules \
    && chown -R hercules:hercules /opt/hercules/conf /opt/hercules/log \
    && chmod 0755 /usr/local/bin/hercules-entrypoint

WORKDIR /opt/hercules
USER hercules

EXPOSE 6900 6121 5121
ENTRYPOINT ["/usr/local/bin/hercules-entrypoint"]
