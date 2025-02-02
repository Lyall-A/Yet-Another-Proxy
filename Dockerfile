FROM node:latest

RUN apt-get update && apt-get install -y git

WORKDIR /data

RUN git config --global --add safe.directory /data
RUN git clone https://github.com/Lyall-A/Yet-Another-Proxy /data

CMD git pull && node .