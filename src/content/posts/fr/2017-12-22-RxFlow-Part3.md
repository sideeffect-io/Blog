---
title: RxFlow, partie 3 — Trucs et astuces
date: 2017-12-22
description: Voici le dernier chapitre de notre voyage dans RxFlow. J’ai déjà présenté toutes les fonctionnalités et tous les principes clés du framework dans les deux parties précédentes. Plongeons-nous maintenant dans quelques trucs et astuces rendus possibles par la programmation réactive.
tags: open source, programmation réactive
image: images/2017-12-22-RxFlow-Part3/RxFlow_Logo.png
lang: fr
---

Voici le dernier chapitre de notre voyage dans **RxFlow**. J’ai déjà présenté toutes les fonctionnalités et tous les principes clés du framework dans les deux articles précédents :

* [RxFlow, partie 1 : La théorie](/fr/posts/2017-11-08-rxflow-part1/)
* [RxFlow, partie 2 : La pratique](/fr/posts/2017-12-09-rxflow-part2/)

Plongeons-nous maintenant dans quelques trucs et astuces rendus possibles par la programmation réactive.

# Des UIViewControllers réactifs

Comme nous l’avons vu dans la partie 2, nous devions à un moment donné savoir de manière réactive si un **Presentable** était affiché ou non. Un Presentable expose trois Observables :

```swift
/// Observable that triggers a bool indicating if
/// the current Presentable is being displayed
var rxVisible: Observable<Bool> { get }

/// Single triggered when this presentable is displayed
/// for the first time
var rxFirstTimeVisible: Single<Void> { get }

/// Single triggered when this presentable is dismissed
var rxDismissed: Single<Void> { get }
```

Dans **RxFlow**, UIViewController se conforme à ce protocole. Nous devons donc trouver un moyen de le rendre réactif.

Heureusement, un excellent projet découvert en chemin m’a beaucoup aidé : [RxViewController](https://github.com/devxoul/RxViewController).

Il fournit une extension Reactive aux UIViewControllers en appliquant le pattern décrit dans cet article : [Un namespace polyvalent en Swift](/fr/posts/2017-11-22-versatilenamespace/). Il utilise également les fonctions intégrées de RxCocoa qui permettent d’observer les appels de sélecteurs. Une fois le concept compris, j’ai créé ma propre extension de UIViewController.

```swift
extension Reactive where Base: UIViewController {

    /// Observable, triggered when the view has appeared for the first time
    public var firstTimeViewDidAppear: Single<Void> {
        return sentMessage(#selector(Base.viewDidAppear)).map { _ in
            return Void()
        }.take(1).asSingle()
    }

    /// Observable, triggered when the view is being dismissed
    public var dismissed: ControlEvent<Bool> {
        let source = sentMessage(#selector(Base.dismiss))
                     .map { $0.first as? Bool ?? false }
        return ControlEvent(events: source)
    }

    /// Observable, triggered when the view appearance state changes
    public var displayed: Observable<Bool> {
        let viewDidAppearObs = sentMessage(#selector(Base.viewDidAppear))
                               .map { _ in true }
        let viewWillDisappearObs = sentMessage(#selector(Base.viewWillDisappear))
                                   .map { _ in false }
        return Observable<Bool>.merge(viewDidAppearObs, viewWillDisappearObs)
    }
}
```

Pour mémoire, voici comment cette extension est utilisée par le **Coordinator**. « nextPresentable » est le **Presentable** produit par une fonction **navigate(to:)** d’un **Flow**. Nous n’écoutons le **Stepper** suivant qu’après le tout premier affichage du **Presentable** associé.

```swift
nextPresentable.rxFirstTimeVisible.subscribe(onSuccess: { [unowned self,
                                                           unowned nextPresentable,
                                                           unowned nextStepper] (_) in
    // we listen to the presentable's Stepper.
    // For each new Step value, we trigger a new navigation process
    // this is the core principle of the whole RxFlow mechanism
    // The process is paused each time the presentable is not currently displayed
    // for instance when another presentable is above it in the VCs hierarchy.
    nextStepper.steps
        .pausable(nextPresentable.rxVisible.startWith(true))
        .asDriver(onErrorJustReturn: NoStep())
        .drive(onNext: { [unowned self] (step) in
            // the nextPresentable's Stepper fires a new Step
            self.steps.onNext(step)
        }).disposed(by: nextPresentable.disposeBag)

}).disposed(by: self.disposeBag)
```

# Faisons une pause

Un autre principe clé de **RxFlow** est le suivant : ce qui se passe dans un **Flow** reste dans ce **Flow**. Je devais donc trouver un moyen de mettre en pause les abonnements aux **Steps** lorsque le **Flow** n’était plus au sommet de la hiérarchie des vues.

RxSwift ne fournit pas directement de moyen de mettre un abonnement en pause, mais [RxSwiftExt](https://github.com/RxSwiftCommunity/RxSwiftExt) le fait. Ce projet de la [RxSwiftCommunity](https://github.com/RxSwiftCommunity) ajoute de nombreux opérateurs à RxSwift, comme [pausable](https://github.com/RxSwiftCommunity/RxSwiftExt#pausable).

> Il met en pause les éléments de la séquence observable source tant que le dernier élément de la seconde séquence observable n’est pas vrai.

Regardons son implémentation.

```swift
extension ObservableType {

    /// Pauses the elements of the source observable sequence based on
    /// the latest element from the second observable sequence.
    /// Elements are ignored unless the second sequence has most recently
    /// emitted `true`.
    /// - Parameter pauser: The observable sequence used to pause the source
    /// observable sequence.
    /// - Returns: The observable sequence which is paused based upon
    /// the pauser observable sequence.
    public func pausable<P: ObservableType> ( _ pauser: P) -> Observable<E>
                                                              where P.E == Bool {
        return withLatestFrom(pauser) { element, paused in
            (element, paused)
            }.filter { _, paused in
                paused
            }.map { element, _ in
                element
        }
    }
}
```

Il ne s’agit en réalité que d’une combinaison de trois opérateurs intégrés à RxSwift :

* **withLatestFrom** associe à la valeur émise par l’Observable principal la dernière valeur d’un autre Observable appelé « pauser », celui qui pilote la pause ;
* **filter** n’accepte que les valeurs vraies de l’Observable « pauser » ;
* **map** ignore les valeurs de l’Observable « pauser » afin de ne renvoyer que la valeur de l’Observable principal.

Voici encore une fois son utilisation par le **Coordinator** :

```swift
nextStepper
    .steps
    .pausable(nextPresentable.rxVisible.startWith(true))
    .asDriver(onErrorJustReturn: NoStep())
    .drive(onNext: { [unowned self] (step) in
        // the nextPresentable's Stepper fires a new Step
        self.steps.onNext(step)
    }).disposed(by: nextPresentable.disposeBag)
```

La lecture est très simple : les **Steps** de nextStepper sont mis en pause lorsque les valeurs de l’Observable « rxVisible » sont fausses.

# Des propriétés stockées dans les protocoles ?

En tant que framework orienté protocoles, **RxFlow** demande au développeur d’implémenter plusieurs protocoles. Lorsque vous construisez ce type de framework, vous ne voulez pas obliger l’utilisateur à implémenter trop de fonctions ou de propriétés pour satisfaire ces protocoles.

Les fonctions ne posent pas de problème, car les extensions de protocole peuvent fournir une implémentation par défaut. Les propriétés, en revanche, sont plus délicates : Swift ne permet pas de les stocker dans une telle extension.

Par exemple, lorsque vous implémentez le protocole **Stepper**, une propriété **step** vous permet d’émettre de nouvelles valeurs de **Step**. Comment ai-je fait ?

Une fois encore, la RxSwiftCommunity m’a beaucoup aidé. Je me suis inspiré de [NSObject-Rx](https://github.com/RxSwiftCommunity/NSObject-Rx). Ce projet propose une extension de NSObject qui stocke un DisposeBag RxSwift. L’objectif est de fournir un DisposeBag par défaut à toute classe héritant de NSObject, notamment les UIViewControllers. C’était exactement ce dont j’avais besoin, mais dans une extension de protocole. Voici le code de Stepper.

```swift
private var subjectContext: UInt8 = 0

/// a Stepper has only one purpose: emit Steps that correspond to
/// specific navigation states.
/// The state changes lead to navigation actions in the context of
/// a specific Flow
public protocol Stepper: Synchronizable {

    /// the Rx Obsersable that will trigger new Steps
    var steps: Observable<Step> { get }
}

public extension Stepper {

    /// The step in which to publish new Steps
    public var step: BehaviorSubject<Step> {
        return self.synchronized {
            if let subject = objc_getAssociatedObject(self, &subjectContext)
                             as? BehaviorSubject<Step> {
                return subject
            }
            let newSubject = BehaviorSubject<Step>(value: NoStep())
            objc_setAssociatedObject(self,
                                     &subjectContext,
                                     newSubject,
                                     .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            return newSubject
        }
    }

    /// the Rx Obsersable that will trigger new Steps
    public var steps: Observable<Step> {
        return self.step.asObservable()
    }
}
```

Toute la magie se trouve dans la propriété calculée **step**. Nous utilisons la fonction **objc_setAssociatedObject** pour stocker une référence vers un BehaviorSubject — consultez [cet article de NSHipster](http://nshipster.com/associated-objects/). À chaque accès à cette propriété, nous récupérons la référence stockée. Lors du premier appel, le BehaviorSubject est créé et associé à la référence subjectContext.

Cette astuce présente un inconvénient. Les protocoles peuvent être adoptés par des types valeur comme les structures, dont la mémoire est gérée sur la pile et non sur le tas comme pour les types référence. Le cycle de vie et la réutilisation d’une instance de structure sont donc gérés par le runtime Swift. Lorsque celui-ci réutilise une instance, le devenir de la valeur associée par **objc_getAssociatedObject** n’est pas garanti. Pour sécuriser cette approche, ce type de protocole doit être limité aux classes afin de garantir que tout se passe sur le tas.

# Rendre à la communauté

Comme vous pouvez le constater, certaines fonctionnalités clés de RxFlow reposent sur le travail réalisé par la communauté des développeurs. Lorsque vous publiez vous-même un projet open source, il faut en tenir compte : vous aurez besoin d’aide ! Je pense qu’il est important de rendre à la communauté ce qu’elle nous apporte.

Dans le cas de RxFlow, j’ai eu l’occasion d’ouvrir deux pull requests qui ont été fusionnées :

* [Rehabilitates the HasDisposeBag protocol](https://github.com/RxSwiftCommunity/NSObject-Rx/pull/49)
* [Add new observables for displayed and dismissed states](https://github.com/devxoul/RxViewController/pull/4)

Savoir que mon code pouvait aider d’autres développeurs m’a fait vraiment plaisir.

# Conclusion

Rendre disponible mon premier projet open source a été un véritable défi. Ce n’était PAS aussi facile qu’on pourrait le croire, car il faut :

* rassembler et synthétiser toutes les idées qui ont conduit au projet — idées issues de projets précédents, problèmes et solutions rencontrés… Prenez donc le temps d’y réfléchir avant de coder quoi que ce soit :-) ;
* choisir les patterns adaptés à la complexité du projet et ne pas tomber dans la sur-ingénierie ;
* penser comme la personne qui utilisera le code et le garder aussi simple que possible — c’est le plus difficile ;
* rédiger un bon README, car le code ne suffit pas à rendre un projet attractif ;
* gérer ses sources avec professionnalisme. Personne n’a envie de contribuer à un projet qui paraît négligé — la ligne de commande Git est votre meilleure amie ;
* écrire des articles pour partager son travail et recevoir les retours de personnes brillantes ;
* garder confiance. Vous serez parfois découragé : faites une pause si vous êtes submergé, changez-vous les idées et l’inspiration reviendra.

RxFlow est disponible en version 2.9.0 sur CocoaPods, Carthage et SPM.

Dépôt GitHub de RxFlow : [https://github.com/RxSwiftCommunity/RxFlow](https://github.com/RxSwiftCommunity/RxFlow)

À bientôt.
