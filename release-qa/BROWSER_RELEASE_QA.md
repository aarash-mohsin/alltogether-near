# Browser checks on the built app

Observed on 5–6 November 2026 in a browser against the isolated built application, not the Vite dev server. These are manual checks on top of the automated tests; they do not prove the app is free of defects.

## AllTogether — localhost 9091, isolated campaign 4

- A response dropped after a real pledge commit triggered a browser transport retry using the same operation identity: exactly one 1-testUSD debit.
- A second pledge of 2 testUSD committed while its response was held. After the UI timeout and actual page reload, the unfinished-request panel retained actor, endpoint and identity. Resuming confirmed the original request. Venue active principal stayed 3 and Alice balance stayed 3822; no second debit.
- Controlled API outage showed stale/connection guidance and disabled pledge and removal controls. Restoring the API recovered the view.
- A held Alice account read followed by a switch to Bob did not expose Alice's own-position controls after release of the old response. Bob remained selected and had zero removal controls.
- Updated built production authoring rejected the configured escrow as budget 1's beneficiary before showing a publish review, naming the offending budget and asking for the actual service recipient. No invalid plan was published.

## Responsive and live wallet boundary

- The built detail page rendered inside a real 360-pixel iframe. The inner document measured clientWidth 345 and scrollWidth 345 (15-pixel scrollbar), with a readable narrow layout and no horizontal page overflow.
- Updated AllTogether production server at localhost 8787 displayed actual verified final-block binding, retained access-key counts, faucet capacity, live campaign states, Matched custody and zero book residual. Wallet picker opened and Escape dismissed it without connecting or signing. External wallet account login/approval was not exercised; actual SDK-backed controller execution is recorded separately.
