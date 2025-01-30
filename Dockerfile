FROM denoland/deno:alpine
EXPOSE 8000
WORKDIR /app
COPY deno.* .
COPY public ./public
COPY src ./src
RUN deno cache src/server.ts
RUN deno eval --unstable-ffi "import '@db/sqlite'"
CMD ["run", "-A", "--unstable-kv", "src/server.ts"]