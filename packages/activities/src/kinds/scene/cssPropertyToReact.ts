/** The scene specs name CSS properties the way CSS does (`font-size`); React's
 * `style` wants them camelCased (`fontSize`). */
export function cssPropertyToReact(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
