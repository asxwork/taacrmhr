import NextLink from "next/link";

/**
 * App-wide link: no automatic background loading unless asked (`prefetch`). Next's default fetches every visible
 * link, which on a page with a sidebar and a list meant 25+ server requests per page, and with the browser's
 * ~6-connection limit a real click had to queue behind them.
 */
export default function Link({ prefetch = false, ...props }: React.ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
