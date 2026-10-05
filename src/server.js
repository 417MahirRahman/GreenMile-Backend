import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, (error) => {
  if (error) {
    console.error("GreenMile Backend failed to start:", error.code || error.name);
    process.exitCode = 1;
    return;
  }
  console.log(`GreenMile Backend running on http://localhost:${PORT}`);
});
