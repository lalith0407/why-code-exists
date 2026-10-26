# Held-out 6 ground truth (written before the run)

## heldout6-outcome-keys
- Cause: `src/components/selected-work.tsx`, inside `SelectedWork`'s outcomes `.map`: `key={outcome.detail}`. Outcome details are not unique (`caseStudyStub` gives three identical `"[Outcome — what changed.]"`), so sibling keys collide.
- Correct claim: names the non-unique key expression (detail text used as the React key) as the cause.
- Correct fix: a key that is unique among siblings (e.g. index, or slug + index), in selected-work.tsx at or near the cited line.
- Wrong-cause or insufficient: changing only the stub data in site.ts so details differ (real content can repeat; the component stays broken); suppressing console.error; blaming the tags `key={tag}` (tags are unique in the data); blaming React/jsdom.
- Scored: proven + correct claim = success. Proven with a wrong claim = false proof. Anything else = not proven.
- Caveat: SelectedWork is unreachable in the final tree (replaced by CaseStudies); the bug was live on the home page earlier in the build.
