package db

import (
	"context"
	"database/sql"
)

func Open(driverName, dataSourceName string) (*sql.DB, error) {
	return sql.Open(driverName, dataSourceName)
}

func Ping(ctx context.Context, database *sql.DB) error {
	return database.PingContext(ctx)
}
