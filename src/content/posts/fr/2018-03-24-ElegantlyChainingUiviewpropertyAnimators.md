---
title: Enchaîner élégamment des UIViewPropertyAnimators
date: 2018-03-24
description: Mes articles parlent généralement de design patterns, d’architectures logicielles — ou de RxFlow 😀 —, mais celui-ci sera différent. Je ne pensais franchement pas écrire un jour sur ce sujet, pourtant j’ai quelque chose de sympa à partager. Aujourd’hui, nous allons donc parler des animations avec Swift.
tags: uikit, programmation réactive
image: images/2018-03-24-ElegantlyChainingUiviewpropertyAnimators/Animator_blog.png
lang: fr
---

Mes articles parlent généralement de design patterns, d’architectures logicielles — ou de RxFlow 😀 —, mais celui-ci sera différent. Je ne pensais franchement pas écrire un jour sur ce sujet, pourtant j’ai quelque chose de sympa à partager. Aujourd’hui, nous allons donc parler des animations avec Swift.

Je ne suis pas expert en UI/UX, nous n’allons donc pas nous plonger dans les frameworks d’animation d’iOS. Mais j’ai récemment dû relever un défi au travail. Un collègue m’a exposé ce problème : « Dans notre application, plusieurs animations sont jouées en séquence et notre manière de le faire est assez affreuse. Existe-t-il une meilleure solution ? »

# UIView.animate()

Ce qu’il trouvait affreux, c’était notre façon traditionnelle d’enchaîner les animations avec UIKit. Pour illustrer mon propos, considérons cette séquence :

![](/images/2018-03-24-ElegantlyChainingUiviewpropertyAnimators/animator-4.gif)

Avant iOS 10, on aurait pu coder cette séquence ainsi :

```swift
/// on the "Play animation" click

UIView.animate(withDuration: 1, animations: { [unowned self] in
    self.box1.transform = CGAffineTransform(translationX: 0,
                                            y: -100)
}) { (completed) in
    if completed {
        UIView.animate(withDuration: 1, animations: { [unowned self] in
            self.box2.transform = CGAffineTransform(translationX: 0,
                                                    y: -100)
        }) { (completed) in
            if completed {
                UIView.animate(withDuration: 1, animations: { [unowned self] in
                    self.box3.transform = CGAffineTransform(translationX: 0,
                                                            y: -100)
                }) { (completed) in
                    if completed {
                        UIView.animate(withDuration: 1, animations: { [unowned self] in
                            self.box1.transform = CGAffineTransform(translationX: -100,
                                                                    y: -100)
                            self.box3.transform = CGAffineTransform(translationX: 100,
                                                                    y: -100)
                        }) { (completed) in
                            if completed {
                                print ("Animations are over")
                            }
                        }
                    }
                }
            }
        }
    }
}
```

UIView.animate() fournit un bloc de complétion que nous pouvons utiliser pour déclencher l’animation suivante et ainsi créer une chaîne d’animations. Comme vous pouvez le constater, le principal défaut de cette technique est la laideur du code. Il est à peine lisible.

# UIViewPropertyAnimator

Heureusement, iOS 10 a introduit **UIViewPropertyAnimator**. Je ne vais pas décrire toutes les fonctionnalités qu’il propose ; vous trouverez une bonne introduction sur [Use Your Loaf](https://useyourloaf.com/blog/quick-guide-to-property-animators/).

Ce qui m’intéresse ici, c’est l’amélioration de la lisibilité du mécanisme d’enchaînement. Tout d’abord, UIViewPropertyAnimator améliore nativement la technique des blocs de complétion.

L’extrait précédent devient :

```swift
/// initialize UIViewPropertyAnimator lazily

lazy var animator1 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box1.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator2 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box2.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator3 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box3.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator4 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box1.transform = CGAffineTransform(translationX: -100, y: -100)
        self.box3.transform = CGAffineTransform(translationX: 100, y: -100)
    }
}()

...

/// connect animations together

self.animator1.addCompletion { [unowned self] _ in
    self.animator2.startAnimation()
}

self.animator2.addCompletion { [unowned self] _ in
    self.animator3.startAnimation()
}

self.animator3.addCompletion { [unowned self] _ in
    self.animator4.startAnimation()
}

...

/// on the "Play animation" click

self.animator1.startAnimation()
```

Cela permet de séparer clairement la définition de chaque animation de la manière dont elles sont reliées.

La lisibilité est bien meilleure, tout comme le découplage. Nous pourrions imaginer enchaîner les animations différemment selon le contexte. Plutôt sympa.

Mais il reste encore une chose…

# Enchaînement réactif des animations

Je suis un grand amateur de programmation réactive et la première chose qui m’est venue à l’esprit fut : est-il possible de rendre **UIViewPropertyAnimator** compatible avec RxSwift ?

Que souhaitons-nous observer de manière réactive ? C’est assez simple : la fin d’une animation, afin de pouvoir déclencher la suivante.

Avec RxSwift, rendre un élément compatible avec la programmation réactive consiste traditionnellement à ajouter une extension à la structure Reactive. Cela semble être un bon point de départ.

Nous devons déterminer le type d’extension nécessaire et le type qu’elle doit renvoyer.

Cette extension devra encapsuler les mécanismes **startAnimation** et **addCompletion** de UIViewPropertyAnimator. Elle devra également renvoyer une forme d’**Observable**. Pour simplifier, nous supposerons cependant qu’une animation peut seulement se **terminer** : il n’y a aucune gestion de **flux**, comme **onNext**, **onSubscribed**, **onDisposed**, etc. Cette hypothèse a une conséquence intéressante sur notre implémentation. Notre extension Reactive ne renverra pas un **Observable**, mais un **Completable**, un **Trait** indiquant que l’Observable peut uniquement se **terminer** — ou échouer.

Sans plus attendre, voici cette extension :

```swift
extension Reactive where Base == UIViewPropertyAnimator {

    var animate: Completable {
        return Completable.create(subscribe: { (completable) -> Disposable in

            self.base.addCompletion({ (position) in
                if position == .end {
                    completable(.completed)
                }
            })

            self.base.startAnimation()

            return Disposables.create {
                self.base.stopAnimation(true)
            }
        })
    }
}

extension UIViewPropertyAnimator {
    var rx: Reactive<UIViewPropertyAnimator> {
        return Reactive<UIViewPropertyAnimator>(self)
    }
}
```

Pour résumer, l’extension **animate** renvoie un **Completable** qui, lorsqu’on s’y abonne, démarre l’animation et ajoute un bloc de complétion envoyant un événement **.completed** au **Completable** renvoyé.

L’objectif est très simple : être averti lorsqu’une animation se termine afin de démarrer la suivante.

Ce qui est génial avec les **Completables**, c’est la possibilité de les enchaîner grâce au très agréable sucre syntaxique **andThen**.

Voyons cela en action :

```swift
self.animator1.rx.animate
    .andThen(self.animator2.rx.animate)
    .andThen(self.animator3.rx.animate)
    .andThen(self.animator4.rx.animate)
    .subscribe()
    .disposed(by: self.disposeBag)
```

C’est très facile à lire et parfaitement explicite. La séquence d’animations peut même varier en fonction du contexte, tout en conservant une structure de code très claire :

```swift
var completable = self.animator1.rx.animate

if shouldAnimateBox2 {
    completable = completable.andThen(self.animator2.rx.animate)
}

completable.andThen(self.animator3.rx.animate)
    .andThen(self.animator4.rx.animate)
    .subscribe()
    .disposed(by: self.disposeBag)
```

Mais attendez, il reste une **dernière** chose…

# Enchaînement magique des animations

Bien que l’enchaînement réactif soit assez satisfaisant, tout le monde ne souhaite pas dépendre de RxSwift pour améliorer la qualité de son code !

Swift possède une fonctionnalité vraiment sympa pour raccourcir les instructions complexes tout en renforçant leur expressivité : les **opérateurs personnalisés**.

Il faut un peu de créativité pour trouver la bonne approche. Je me suis donc demandé quelle syntaxe permettrait aux autres développeurs de comprendre mon code d’un simple coup d’œil. J’ai abouti à ceci :

```
animation1 ~> animation2 ~> animation3 ~> animation4
```

Pourrait-on faire plus simple ?

Mettons cela en œuvre :

```swift
infix operator ~>: AdditionPrecedence

@discardableResult
func ~>(left: UIViewPropertyAnimator, right: UIViewPropertyAnimator) -> UIViewPropertyAnimator{

    left.addCompletion { (_) in
        right.startAnimation()
    }

    return right
}
```

Qu’avons-nous fait ici ?

* défini un nouvel opérateur binaire : **~>** ;
* défini le comportement de cet opérateur lorsqu’il est appliqué à deux UIViewPropertyAnimators.

Il s’agit simplement de relier deux UIViewPropertyAnimators et d’accrocher le démarrage du second à la fin du premier.

Cette nouvelle syntaxe ne pourrait pas être plus simple à utiliser :

```swift
self.animator1 ~> self.animator2 ~> self.animator3 ~> self.animator4
self.animator1.startAnimation()
```

Je suis toujours impressionné par l’efficacité que Swift peut apporter à notre manière de coder. J’étais autrefois un développeur Java et, croyez-moi, disposer d’une syntaxe aussi concise est un soulagement.

J’espère que cela vous donnera de nouvelles idées pour aller encore plus loin dans l’enchaînement d’animations avec Swift.

À bientôt.
