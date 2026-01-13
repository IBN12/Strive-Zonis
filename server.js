import express from 'express';
import path from 'node:path'; 

const server = express();
const PORT = 3000;

// Serve everything in thep "public" folder:
server.use(express.static("public")); 

// Start Server: 
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`); 
}); 