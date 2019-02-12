import {
  ConnectionCredentials,
  ConnectionDialect,
  DatabaseInterface,
  DialectQueries,
} from '../../interface';
import * as Utils from '../../utils';
import queries from './queries';
import OracbleDBLib from 'oracledb';
import GenericDialect from '../generic';
import { MissingModule } from '@sqltools/core/exception';

const OracleDBVersion = '3.1.1';
export default class Oracle extends GenericDialect<OracbleDBLib.IConnection> implements ConnectionDialect {
  private poolCreated = false;
  public get connection() {
    if (!this.poolCreated) return;
    return this.lib.getConnection() as Promise<OracbleDBLib.IConnection>;
  }

  static needToInstall() {
    try {
      __non_webpack_require__.resolve('sqlite3');
      return false;
    } catch(e) { }
    return true;
  }
  queries = queries

  private get lib(): typeof OracbleDBLib {
    return __non_webpack_require__('oracledb');
  }

  public async open() {
    if (this.poolCreated) {
      return this.connection;
    }

    if (Oracle.needToInstall()) {
      return Promise.reject(new MissingModule('oracledb', OracleDBVersion));
    }

    const connectString = (this.credentials.server && this.credentials.port) ?
      `${this.credentials.server}:${this.credentials.port}/${this.credentials.database}` :
      this.credentials.database;
    await OracbleDBLib.createPool({
      connectString,
      password: this.credentials.password,
      user: this.credentials.username,
    });
    this.poolCreated = true;
    return this.connection;
  }

  public async close() {
    if (!this.poolCreated) return Promise.resolve();
    await this.lib.getPool().close(10 as any);
    this.poolCreated = false;
  }

  public async query(query: string): Promise<DatabaseInterface.QueryResults[]> {
    const conn = await this.open();
    const results = await conn.execute(query, [], { outFormat: this.lib.OBJECT })
      .then(res => Array.isArray(res) ? res : [res]);
    const queries = query.split(/\s*;\s*(?=([^']*'[^']*')*[^']*$)/g).filter(Boolean);
    const messages = [];
    console.log(results);
    // results.map(() => void 0);
    // return results.map((r, i) => {
    //   if (r.rowsAffected) {
    //     messages.push(`${r.rowsAffected} rows were affected.`);
    //   }
    //   return {
    //     cols: (r.rows && r.rows.length) > 0 ? Object.keys(r.rows[0]) : [],
    //     messages,
    //     query: queries[i],
    //     results: r.rows,
    //   };
    // });
    return []
  }

  public getTables(): Promise<DatabaseInterface.Table[]> {
    return this.query(this.queries.fetchTables)
      .then(([queryRes]) => {
        return queryRes.results
          .reduce((prev, curr) => prev.concat(curr), [])
          .map((obj) => {
            return {
              name: `${obj.TABLESCHEMA}.${obj.TABLENAME}`,
              isView: !!obj.ISVIEW,
              numberOfColumns: parseInt(obj.NUMBEROFCOLUMNS, 10),
              tableCatalog: obj.TABLECATALOG,
              tableDatabase: obj.DBNAME,
              tableSchema: obj.TABLESCHEMA,
            } as DatabaseInterface.Table;
          })
          .sort();
      });
  }

  public getColumns(): Promise<DatabaseInterface.TableColumn[]> {
    return this.query(this.queries.fetchColumns)
      .then(([queryRes]) => {
        return queryRes.results
          .reduce((prev, curr) => prev.concat(curr), [])
          .map((obj) => {
            return {
              columnName: obj.COLUMNNAME,
              defaultValue: obj.DEFAULTVALUE,
              isNullable: !!obj.ISNULLABLE ? obj.ISNULLABLE.toString() === 'yes' : null,
              size: obj.size !== null ? parseInt(obj.SIZE, 10) : null,
              tableCatalog: obj.TABLECATALOG,
              tableDatabase: obj.DBNAME,
              tableName: `${obj.TABLESCHEMA}.${obj.TABLENAME}`,
              tableSchema: obj.TABLESCHEMA,
              type: obj.TYPE,
            } as DatabaseInterface.TableColumn;
          })
          .sort();
      });
  }

  public describeTable(table: string) {
    const tableSplit = table.split('.');
    return this.query(Utils.replacer(this.queries.describeTable, { schema: tableSplit[0], table: tableSplit[1] }));
  }
}