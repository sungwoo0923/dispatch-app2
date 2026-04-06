import express from "express";
import cors from "cors";
import routeHandler from "./route.js";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/route", routeHandler);

app.listen(3000, () => {
  console.log("🚀 API 서버 실행: http://localhost:3000");
});
