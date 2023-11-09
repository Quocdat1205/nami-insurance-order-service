import { Document, FlattenMaps } from 'mongoose';

export type MongoModel<T> = T & Document<any, any, any> & { _id?: any };

export type LeanMongoModel<T> = T & { _id?: any };

export type ObjectMongoModel<T> = FlattenMaps<LeanMongoModel<T>>;
