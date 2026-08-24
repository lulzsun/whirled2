# Spec: html/template escaping

Status: **implemented**
Owner: @lulzsun
Last updated: 2026-08-24

## 1. Summary

Every server-rendered page used to go through Go's **`text/template`**, which
performs no escaping of any kind. Every value a template interpolated —
comment bodies, item names, nicknames, group descriptions, post titles —
reached the browser as raw markup. The whole `api` package now uses
**`html/template`** instead, which escapes contextually: HTML text, attribute
values, URLs, CSS and JS each get the treatment appropriate to where the value
lands.

This was the "real fix" the groups spec kept deferring to. Groups had been
escaping its own fields by hand (`escapeGroupText`); those calls are gone,
because escaping a value that `html/template` will escape again renders
`&amp;lt;` where the user typed `<`.

## 2. What this closed

Two classes of bug, one of them a live vulnerability.

**Stored XSS in every comment thread.** A comment body containing
`<img src=x onerror=…>` was previously served as markup to everyone who
loaded the page. That affected profile comments, shop-listing comments, and
(before this change landed) anything else rendering user text. Now the same
payload renders as visible text and executes nothing — verified with a real
payload seeded into all three comment hosts plus a group post, checking in the
browser that no script ran and no element was injected, and that the text
displays exactly as typed rather than as `&lt;img …`.

**Reflected `javascript:` URL on the error page.** `ErrorMiddleware` built the
error page's Dismiss link by string concatenation:

```go
formatErr["Redirect"] = "href='" + e.Request.Referer() + "'"
```

and the template emitted that whole fragment as an attribute. An attacker who
could control the `Referer` header — a link from their own page to any URL
that errors — got a live `javascript:` link on the resulting page. The
template now builds the attribute itself from a URL-only value:

```gohtml
{{ if .RedirectUrl }}href="{{ .RedirectUrl }}"{{ end }}
```

`html/template` recognises `href` as a URL context and neutralises dangerous
schemes: a `javascript:` Referer now renders as `href="#ZgotmplZ"`.

This is also _why_ the old construction had to go. `html/template` refuses to
compile a template that injects an entire attribute from a value, and rightly
— it cannot escape what it cannot see the shape of.

## 3. Verifying it

`html/template` runs its escaping analysis at the **first `Execute`**, not at
parse time. `template.Must(...ParseFiles(...))` at init therefore proves
nothing about escaping, and a page with a bad context fails only when someone
actually loads it. Auth-gated pages are the dangerous case: nobody browsing
anonymously will ever trigger them.

So the check that matters is executing **every defined template in every
parsed set** and looking for escaping errors specifically (data errors from
dummy input are irrelevant and expected). Doing that caught exactly one
failure, in `groupManage.gohtml` — a page only moderators can reach, which
would have returned 500 for every one of them.

If you touch the templates, it is worth re-running that sweep. It is a
throwaway route: iterate the `*template.Template` package globals, call
`ExecuteTemplate` for each `.Templates()` entry with an empty
`map[string]any`, and report any error mentioning `html/template` or
`context`, plus any `ZgotmplZ` appearing in the output.

## 4. Things that will bite you

-   **`</textarea>` must not be split across lines.** Prettier formats a
    textarea with template content as `</textarea` + newline + `>`, which
    `html/template`'s RCDATA scanner does not accept as closing the element.
    The enclosing conditional then "ends in a different context" and the page
    refuses to render. `groupManage.gohtml` keeps its textarea on one line
    behind a `<!-- prettier-ignore -->`; any new textarea holding a template
    value needs the same treatment.
-   **`ZgotmplZ` in output means a value was rejected**, not that rendering
    failed. It is `html/template` refusing to emit an unsafe URL or CSS value.
    Seeing it usually means a value reached a context it does not belong in.
-   **Never hand a template pre-built markup.** If a value needs to be an
    attribute, a URL, or a tag, build that in the template and pass the plain
    value. The `template.HTML` / `template.URL` escape hatches exist but turn
    escaping off for that value — they are the thing this change removed, and
    they should not come back without a strong reason.
-   **Do not add manual escaping.** `html/template` already did it. A second
    pass shows users `&amp;lt;` where they typed `<`.
-   The CSS context in `comment.gohtml` (the `[id='…']:checked` reply-box
    selector) is fine: PocketBase record ids are alphanumeric and pass the CSS
    value filter unchanged.

## 5. Not addressed

-   **`main.go`'s `/test` route** already used `html/template`.
-   **The client-side renderer** (`game/client/`) builds DOM through `jsx-dom`,
    which sets text nodes rather than parsing HTML, and is out of scope here.
-   **Existing stored content is not sanitised**, only escaped on output.
    That is the correct order — the database holds what the user typed, and
    the display layer decides how to render it safely.
