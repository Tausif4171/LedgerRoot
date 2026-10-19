# UI/UX system

Six base colors: canvas `#F7F8F5`, surface `#FFFFFF`, ink `#17241F`, brand `#245D46`, warning `#8A4B08`, danger `#B42318`. Semantic aliases and color-mix derivatives live in `globals.css`; boundary lint rejects arbitrary feature colors. Geist body type, 16px base, four-pixel spacing, shared buttons, dialogs, status, radii and focus rings.

Documents is the primary workspace, not a marketing dashboard. Search and filters identify work; counts are workspace totals, not page totals. Empty, error, processing and missing-information states are actionable. Skeletons reserve space. Transfers display measured bytes; inference uses named stages, never invented percentage progress.

Review uses source/fields side-by-side on desktop with history below; narrow devices use Source/Fields/History tabs. Source evidence stays inspectable after approval. Edits are not reset by polling. A conflict preserves typed values and provides a latest-saved comparison; replacing the form is explicit. Approve is non-optimistic and human-confirmed. Reject and Needs information are distinct, reasoned decisions.

Accessibility target: WCAG 2.2 AA. Labels, visible keyboard focus, modal focus return, text status names, 44px controls, reduced motion, contrast and reflow are project requirements. Opacity/transform motion is short and nonessential. Automated axe and keyboard/browser tests are evidence, not a certification; broad screen-reader/assistive-technology validation remains outstanding.

The primary source viewer loads with the review workspace; history and requests remain deferred component imports. Thumbnails avoid loading source images in lists. Query polling stops at terminal stages and when the document is hidden. TanStack Query provides bounded error retries. Lists paginate and search is debounced. Quality uses tables and states real data provenance, scope and limitations.

## Refined light interface

The document and its evidence are the visual focus. Keep the existing green identity and Geist; avoid decorative dashboards, extra typefaces, gradients, and page-entry animations. Lists favor scanning; the review workspace favors careful comparison. All content is left aligned, with amounts right aligned and tabular numerals.

Use the existing six base colors above. Derived border, muted, info, warning, and error backgrounds use semantic aliases and color mixing. Green identifies primary actions and approved states, amber identifies attention, and red identifies errors or rejection. A sample example is neutral guidance, never a warning.

Spacing uses 4/8/12/16/20/24/32px steps. Controls have a 44px minimum target; text inputs use 16px type on phones. The type scale is 12px metadata, 14px controls/supporting copy, 16px body, 18px section titles, and 28px page titles. Controls use 6px radii, panels 8px, and dialogs 12px. Shadows are reserved for overlays and elevated action feedback.

Desktop structure:

```text
Sidebar | Compact sample disclosure + actor + Reset demo
        | Page heading / primary action
        | Compact summary / filter toolbar / document list

Review  | Request status and actions, when applicable
        | Source (sticky) | Review fields
        |                 | One action footer
        | History and earlier sources
```

Below 1101px the existing Source/Fields/History tabs remain; the form stays mounted. Mobile navigation and sample controls wrap rather than creating hidden menus. Review actions stay in normal flow at every size: an early sticky-footer trial obscured fields. Only the desktop source pane is sticky, and it must not obscure focus or feedback.

The three requested skills were installed and read on October 16, 2026: `frontend-design`, `ui-ux-pro-max`, and `web-design-guidelines`. Their guidance supports this project specification; it does not override server guards, sample disclosures, existing input restrictions, or the explicit light-only scope. UI UX Pro Max's generated marketing layouts did not fit this workspace; its accessibility and interaction references informed the refinement instead. Automated and manual verification results belong in `docs/verification.md`.
