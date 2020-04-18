exports.get404 = (req, res, next) => {
  res.status(404).render("404", {
    pageTitle: "Page Not Found",
    path: "/404",
    isAuthenticated: req.session.isLoggedIn,
  });
};

exports.get500 = (req, res, next) => {
  console.log(req.user.seller);
  console.log("Sasmedasdadadasdsa");

  res.status(404).render("500", {
    isSeller: true,
    pageTitle: "Error",
    path: "/500",
    isAuthenticated: req.session.isLoggedIn,
  });
};
