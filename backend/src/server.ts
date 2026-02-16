import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

const app = express();

app.use(pinoHttp());
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "origin-api", ts: new Date().toISOString() });
});

app.get("/products", (_req, res) => {
    res.json({
        items: [
            { id: "p1", name: "Edge Keyboard", price: 99 },
            { id: "p2", name: "Latency Mouse", price: 49 }
        ],
    });
});

app.use((req, _res, next) => {
    console.log(
        `[TRACE] ${req.headers["x-trace-id"]} ${req.method} ${req.url}`
    );
    next();
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
    console.log(`Origin API listening on http://localhost:${port}`);
});
