# UI/UX system

Six base colors: canvas `#F7F8F5`, surface `#FFFFFF`, ink `#17241F`, brand `#245D46`, warning `#8A4B08`, danger `#B42318`. Semantic aliases and color-mix derivatives live in `globals.css`; boundary lint rejects arbitrary feature colors. Geist body type, 16px base, four-pixel spacing, shared buttons, dialogs, status, radii and focus rings.

Documents is the primary workspace, not a marketing dashboard. Search and filters identify work; counts are workspace totals, not page totals. Empty, error, processing and missing-information states are actionable. Skeletons reserve space. Transfers display measured bytes; inference uses named stages, never invented percentage progress.

Review uses source/fields side-by-side on desktop with history below; narrow devices use Source/Fields/History tabs. Source evidence stays inspectable after approval. Edits are not reset by polling. A conflict preserves typed values and provides a latest-saved comparison; replacing the form is explicit. Approve is non-optimistic and human-confirmed. Reject and Needs information are distinct, reasoned decisions.

Accessibility target: WCAG 2.2 AA. Labels, visible keyboard focus, modal focus return, text status names, 44px controls, reduced motion, contrast and reflow are project requirements. Opacity/transform motion is short and nonessential. Automated axe and keyboard/browser tests are evidence, not a certification; broad screen-reader/assistive-technology validation remains outstanding.

Source viewer and history are lazy component imports; thumbnails avoid loading source images in lists. Query polling stops at terminal stages and when the document is hidden. TanStack Query provides bounded error retries. Lists paginate and search is debounced. Quality uses tables and states real data provenance, scope and limitations.

The optional `frontend-design`, `ui-ux-pro-max` and `web-design-guidelines` skills were not installed or audited. Existing Sites guidance informed preview/verification, but the user's explicit Next.js/Vercel architecture supersedes its default scaffold and hosting. No Sites deployment is claimed.
