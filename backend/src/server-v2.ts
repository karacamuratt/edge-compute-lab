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
    res.json({
        ok: true,
        service: "origin-api-v2",
        version: "v2",
        ts: new Date().toISOString(),
    });
});

app.get("/products", (_req, res) => {
    res.json({
        version: "v2",
        items: [
            { id: "p1", name: "Edge Keyboard PRO", price: 129 },
            { id: "p2", name: "Latency Mouse X", price: 79 },
            { id: "p3", name: "Cloud Headset", price: 149 },
        ],
    });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(port, () => {
    console.log(`Origin API v2 listening on http://localhost:${port}`);
});
