import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

export async function connectTestDB() {
  // If mongoose is already connected, disconnect it first
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Reset mongoose connection cache to prevent leaks or reuse of disconnected test instances
  (globalThis as any).mongoose = { conn: null, promise: null };

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  // Route all connection requests to this temporary in-memory instance
  process.env.MONGODB_URI = uri;
  
  await mongoose.connect(uri);
}

export async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearTestDB() {
  if (mongoose.connection.readyState === 0) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
}
