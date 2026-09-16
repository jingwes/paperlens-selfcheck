import random

filler = ("Prior work in this area has explored related questions using a variety of "
          "methodological approaches, and the present study builds on that foundation "
          "by extending the analysis to a broader set of conditions and reporting "
          "additional detail about the experimental setup. ")

paras = []
paras.append("<h1>Abstract</h1>")
paras.append("<p>Our method achieves an accuracy of 0.904 on the held-out benchmark, "
             "n = 120 samples, outperforms prior methods on the same task. In our sample, "
             "this suggests the approach generalizes well.</p>")

paras.append("<h1>Introduction</h1>")
for i in range(34):
    paras.append(f"<p>{filler * 3}</p>")

paras.append("<h1>Methods</h1>")
paras.append("<p>We used n = 120 samples across 5 independent runs with fixed seeds for "
             "the classifier. Each biological replicate corresponds to one participant. "
             "The dataset is publicly available at doi.org/10.1000/example, version 2.</p>")
for i in range(56):
    paras.append(f"<p>{filler * 3}</p>")

paras.append("<h1>Results</h1>")
paras.append("<p>Figure 1 shows the main trend across conditions.</p>")
paras.append("<p>As shown in Figure 1, the effect is significant.</p>")
paras.append("<p>Figure 2 shows a secondary trend that is discussed further in the text, "
              "see Figure 2 for details.</p>")
paras.append("<p>Table 1 summarizes the key comparisons discussed below, see Table 1.</p>")
paras.append("<p>Figure 7 shows an additional exploratory result.</p>")
paras.append("<p>The model reaches an accuracy of 0.894 (95% CI 0.87-0.91), compared to "
             "a random baseline of 0.50 plus or minus 0.01.</p>")
for i in range(44):
    paras.append(f"<p>{filler * 3}</p>")

paras.append("<h1>Discussion</h1>")
for i in range(34):
    paras.append(f"<p>{filler * 3}</p>")
paras.append("<p>Limitations: we did not test the model on an independent external cohort, "
             "which would be the most direct way to confirm generalization. Due to time "
             "constraints, further study is needed on additional populations.</p>")

paras.append("<h1>References</h1>")
paras.append("<p>[1] Smith, J. et al. (2021). A prior study. Journal of Examples.</p>")
paras.append("<p>[2] Lee, K. (2020). Another related study. Proceedings of Examples.</p>")
paras.append("<p>[3] Ref not actually cited in the text below.</p>")

# a citation to a reference number with no entry, to test reference_missing
paras.insert(paras.index("<h1>References</h1>"), "<p>This finding is consistent with [5], a study not listed below.</p>")

html = "<html><head><meta charset='utf-8'><style>body{font-family:serif;font-size:11pt;line-height:1.5;} h1{font-size:13pt;}</style></head><body>" + "\n".join(paras) + "</body></html>"

with open("test/fixtures/sample_source.html", "w") as f:
    f.write(html)

print("wrote", len(paras), "blocks")
