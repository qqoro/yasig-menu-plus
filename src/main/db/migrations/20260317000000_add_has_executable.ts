import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.boolean("has_executable").notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("has_executable");
  });
}
