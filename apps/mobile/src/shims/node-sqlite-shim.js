export class DatabaseSync {
  constructor() {
    throw new Error('node:sqlite is not supported on mobile. Use ExpoSQLiteAdapter.');
  }
}

export default { DatabaseSync };
